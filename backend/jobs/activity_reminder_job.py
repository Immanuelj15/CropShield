"""
CropShield / AgriGuard — Farm Activity Reminder & Smart Farming Alert Job
Runs daily (at 6:00 AM IST) and on-demand:
1. Evaluates all active FarmActivityPlans and updates item statuses (upcoming -> due_today -> overdue).
2. For activities due today, dispatches multi-channel alerts to the farmer in their preferred language:
   - irrigation_due
   - fertilizer_due
   - pest_check_due
   - harvest_window_approaching
3. Smart Farming Alerts:
   - heavy_rain_warning (when 7-day rainfall exceeds 75mm: advise clearing drainage and postponing irrigation)
   - heat_warning (when Tmax exceeds 38°C: advise morning irrigation and anti-transpirant mulch)
"""
import logging
from datetime import datetime, date, timedelta
from typing import Dict, Any, List

from beanie import PydanticObjectId

from backend.models.farm import Farm
from backend.models.farm_activity_plan import FarmActivityPlan
from backend.models.weather_snapshot import WeatherSnapshot
from backend.models.job_run_log import JobRunLog
from backend.services.notification_service import notify_farmer
from backend.services.activity_planner_service import parse_date

logger = logging.getLogger("cropshield.activity_reminder")


async def run_activity_reminder_job() -> Dict[str, Any]:
    """
    Executes daily check of all active farm activity plans and dispatches alerts.
    """
    start_time = datetime.utcnow()
    total_plans = 0
    alerts_dispatched = 0
    weather_warnings = 0
    failed_farms = 0
    today = date.today()

    logger.info("Starting Daily Activity Reminder & Smart Farming Alert sweep...")

    active_plans = await FarmActivityPlan.find(FarmActivityPlan.is_active == True).to_list()
    total_plans = len(active_plans)

    for plan in active_plans:
        try:
            farm = await Farm.get(plan.farm_id)
            if not farm:
                continue

            # Farm owner user ID for notification
            owner_id = getattr(farm, "owner_id", None) or getattr(farm, "user_id", None) or str(farm.id)

            crop = plan.crop_type or getattr(farm, "crop_type", "Crop")

            # 1. Update activity statuses
            plan_updated = False
            due_activities: List[Dict[str, Any]] = []

            for act in plan.timeline:
                if act.get("status") == "completed":
                    continue

                act_dt = parse_date(act.get("scheduled_date"))
                if act_dt == today:
                    act["status"] = "due_today"
                    due_activities.append(act)
                    plan_updated = True
                elif act_dt < today:
                    act["status"] = "overdue"
                    plan_updated = True
                else:
                    act["status"] = "upcoming"

            # Check if harvest is approaching within 5 days
            harvest_dt = parse_date(plan.estimated_harvest_date)
            if 0 < (harvest_dt - today).days <= 5:
                due_activities.append({
                    "activity_type": "harvest_window",
                    "title": "Harvest Window Approaching",
                    "days_left": (harvest_dt - today).days,
                })

            if plan_updated:
                plan.last_updated = datetime.utcnow()
                await plan.save()

            # 2. Dispatch Alerts for activities due today
            for item in due_activities:
                act_type = item.get("activity_type")
                if act_type == "irrigation":
                    event = "irrigation_due"
                    msgs = {
                        "en": f"AgriGuard Reminder: Irrigation is scheduled today for your {crop} field.",
                        "ta": f"அக்ரிகார்ட் நினைவூட்டல்: உங்கள் {crop} பயிருக்கு இன்று பாசனம் செய்ய வேண்டும்.",
                        "hi": f"एग्रीगार्ड अनुस्मारक: आपकी {crop} की फसल के लिए आज सिंचाई निर्धारित है।",
                        "te": f"అగ్రిగార్డ్ రిమైండర్: మీ {crop} పంటకు ఈరోజు నీటిపారుదల షెడ్యూల్ చేయబడింది.",
                        "ml": f"അഗ്രിഗാർഡ് ഓർമ്മപ്പെടുത്തൽ: നിങ്ങളുടെ {crop} കൃഷിക്ക് ഇന്ന് ജലസേചനം ആവശ്യമാണ്.",
                    }
                elif act_type == "fertilizer":
                    event = "fertilizer_due"
                    msgs = {
                        "en": f"AgriGuard Reminder: Fertilizer application is due today for your {crop}.",
                        "ta": f"அக்ரிகார்ட் நினைவூட்டல்: உங்கள் {crop} பயிருக்கு இன்று உரமிடும் நாள்.",
                        "hi": f"एग्रीगार्ड अनुस्मारक: आपकी {crop} फसल के लिए आज खाद डालने का दिन है।",
                        "te": f"అగ్రిగార్డ్ రిమైండర్: మీ {crop} పంటకు ఈరోజు ఎరువులు వేసే సమయం వచ్చింది.",
                        "ml": f"അഗ്രിഗാർഡ് ഓർമ്മപ്പെടുത്തൽ: നിങ്ങളുടെ {crop} കൃഷിക്ക് ഇന്ന് വളപ്രയോഗം നടത്തണം.",
                    }
                elif act_type == "pest_check":
                    event = "pest_check_due"
                    msgs = {
                        "en": f"AgriGuard Advisory: Routine pest & disease scan is due today for {crop}.",
                        "ta": f"அக்ரிகார்ட் எச்சரிக்கை: {crop} பயிரில் பூச்சி மற்றும் நோய் பரிசோதனை இன்று செய்ய வேண்டும்.",
                        "hi": f"एग्रीगार्ड सलाह: {crop} में कीट और रोग निगरानी आज निर्धारित है।",
                        "te": f"అగ్రిగార్డ్ సలహా: {crop} పంటలో పురుగుల తనిఖీ ఈరోజు చేయండి.",
                        "ml": f"അഗ്രിഗാർഡ് മുന്നറിയിപ്പ്: {crop} വിളയിലെ കീടരോഗ പരിശോധന ഇന്ന് നടത്തുക.",
                    }
                elif act_type == "harvest_window":
                    event = "harvest_window_approaching"
                    msgs = {
                        "en": f"AgriGuard Alert: {crop} harvest window approaching in {item.get('days_left', 3)} days. Check mandi prices.",
                        "ta": f"அக்ரிகார்ட் எச்சரிக்கை: {crop} அறுவடை இன்னும் {item.get('days_left', 3)} நாட்களில் வரவுள்ளது. மண்டி விலையை சரிபார்க்கவும்.",
                        "hi": f"एग्रीगार्ड चेतावनी: {crop} की कटाई {item.get('days_left', 3)} दिनों में शुरू होने वाली है। मंडी भाव देखें।",
                        "te": f"అగ్రిగార్డ్ హెచ్చరిక: {crop} కోత సమయం {item.get('days_left', 3)} రోజుల్లో ప్రారంభం కానుంది. మార్కెట్ ధరలను తనిఖీ చేయండి.",
                        "ml": f"അഗ്രിഗാർഡ് മുന്നറിയിപ്പ്: {crop} വിളവെടുപ്പ് {item.get('days_left', 3)} ദിവസത്തിനുള്ളിൽ ആരംഭിക്കും. വിപണി വില പരിശോധിക്കുക.",
                    }
                else:
                    continue

                await notify_farmer(owner_id, event, msgs)
                alerts_dispatched += 1

            # 3. Smart Farming Weather Alerts
            latest_weather = await WeatherSnapshot.find(
                WeatherSnapshot.farm_id == farm.id
            ).sort("-date").first_or_none()

            if latest_weather:
                rain_7d = float(latest_weather.engineered.get("rain_sum_7d", latest_weather.rainfall_mm or 0.0))
                t_max = float(latest_weather.raw.get("T2M_MAX", latest_weather.temperature_c or 30.0))

                # Heavy Rain Warning (> 75mm in 7 days)
                if rain_7d > 75.0:
                    rain_msgs = {
                        "en": f"AgriGuard Weather Alert: Heavy cumulative rainfall ({rain_7d:.0f}mm) recorded. Postpone irrigation and clear drainage furrows.",
                        "ta": f"அக்ரிகார்ட் வானிலை எச்சரிக்கை: அதிக மழை ({rain_7d:.0f}மிமீ) பதிவாகியுள்ளது. பாசனத்தை நிறுத்தி, வடிகால் வசதி செய்யவும்.",
                        "hi": f"एग्रीगार्ड मौसम चेतावनी: भारी वर्षा ({rain_7d:.0f}mm) दर्ज की गई। सिंचाई स्थगित करें और जल निकासी सुनिश्चित करें।",
                        "te": f"అగ్రిగార్డ్ వాతావరణ హెచ్చరిక: భారీ వర్షపాతం ({rain_7d:.0f}mm) నమోదైంది. నీటిపారుదల ఆపండి మరియు కాలువలను శుభ్రం చేయండి.",
                        "ml": f"അഗ്രിഗാർഡ് കാലാവസ്ഥാ മുന്നറിയിപ്പ്: കനത്ത മഴ ({rain_7d:.0f}mm) രേഖപ്പെടുത്തി. ജലസേചനം ഒഴിവാക്കുക.",
                    }
                    await notify_farmer(owner_id, "heavy_rain_warning", rain_msgs)
                    weather_warnings += 1

                # Extreme Heat Warning (> 38°C)
                if t_max >= 38.0:
                    heat_msgs = {
                        "en": f"AgriGuard Heat Advisory: Extreme temperature ({t_max:.1f}°C) detected. Irrigate before 8 AM and maintain soil mulch.",
                        "ta": f"அக்ரிகார்ட் வெப்ப எச்சரிக்கை: கடுமையான வெப்பநிலை ({t_max:.1f}°C). காலை 8 மணிக்குள் பாசனம் செய்து தழைக்கூளம் இடவும்.",
                        "hi": f"एग्रीगार्ड लू चेतावनी: अत्यधिक तापमान ({t_max:.1f}°C)। सुबह 8 बजे से पहले सिंचाई करें और मल्चिंग बनाए रखें।",
                        "te": f"అగ్రిగార్డ్ వేడి హెచ్చరిక: తీవ్రమైన ఉష్ణోగ్రత ({t_max:.1f}°C). ఉదయం 8 గంటల లోపు నీరు పెట్టండి.",
                        "ml": f"അഗ്രിഗാർഡ് താപ മുന്നറിയിപ്പ്: ഉയർന്ന താപനില ({t_max:.1f}°C). രാവിലെ 8 മണിക്ക് മുൻപ് നനയ്ക്കുക.",
                    }
                    await notify_farmer(owner_id, "heat_warning", heat_msgs)
                    weather_warnings += 1

        except Exception as e:
            failed_farms += 1
            logger.warning(f"Error processing activity reminders for plan {plan.id}: {e}")

    duration_sec = (datetime.utcnow() - start_time).total_seconds()
    status_summary = {
        "job_name": "daily_activity_reminder_job",
        "total_active_plans": total_plans,
        "activity_alerts_sent": alerts_dispatched,
        "smart_weather_alerts_sent": weather_warnings,
        "failed_farms": failed_farms,
        "duration_seconds": round(duration_sec, 2),
        "executed_at": start_time.isoformat(),
    }

    # Log into job_run_logs
    try:
        log_entry = JobRunLog(
            job_name="daily_activity_reminder_job",
            run_date=today.isoformat(),
            status="SUCCESS" if failed_farms == 0 else "PARTIAL",
            total_farms=total_plans,
            successful_farms=total_plans - failed_farms,
            failed_farms=failed_farms,
            duration_seconds=round(duration_sec, 2),
            details=status_summary,
            created_at=datetime.utcnow(),
        )
        await log_entry.insert()
    except Exception as e:
        logger.debug(f"Could not persist JobRunLog: {e}")

    logger.info("Activity Reminder job completed: %d activity alerts, %d weather alerts sent.", alerts_dispatched, weather_warnings)
    return status_summary
