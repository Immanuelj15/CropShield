import React from 'react'
import { AlertTriangle, RefreshCw, Home } from 'lucide-react'

export class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error }
  }

  componentDidCatch(error, errorInfo) {
    console.error('AgriGuard Component Error Boundary caught:', error, errorInfo)
  }

  componentDidUpdate(prevProps) {
    // Route-level boundaries pass the current pathname as resetKey so navigating away recovers.
    if (this.state.hasError && prevProps.resetKey !== this.props.resetKey) {
      this.setState({ hasError: false, error: null })
    }
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null })
  }

  handleReload = () => {
    this.setState({ hasError: false, error: null })
    window.location.reload()
  }

  handleGoHome = () => {
    this.setState({ hasError: false, error: null })
    window.location.href = '/'
  }

  render() {
    if (this.state.hasError && this.props.variant === 'route') {
      return (
        <div className="max-w-lg mx-auto my-10 bg-white rounded-2xl p-6 border border-red-200 shadow-sm text-center space-y-3" role="alert">
          <div className="w-12 h-12 bg-red-50 text-red-600 rounded-xl flex items-center justify-center mx-auto border border-red-200">
            <AlertTriangle size={24} />
          </div>
          <h2 className="text-lg font-bold text-stone-900">This screen hit an unexpected error</h2>
          <p className="text-xs text-stone-500 font-mono bg-stone-100 p-3 rounded-xl break-all">
            {typeof this.state.error?.message === 'string' ? this.state.error.message : 'Unexpected UI rendering issue'}
          </p>
          <div className="flex items-center justify-center gap-3 pt-1">
            <button
              onClick={this.handleRetry}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-600 text-white text-xs font-bold hover:bg-emerald-700 shadow-sm transition"
            >
              <RefreshCw size={14} /> Try again
            </button>
            <button
              onClick={this.handleGoHome}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-stone-100 text-stone-700 text-xs font-bold hover:bg-stone-200 transition"
            >
              <Home size={14} /> Back to Dashboard
            </button>
          </div>
        </div>
      )
    }

    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-stone-50 flex items-center justify-center p-4">
          <div className="max-w-md w-full bg-white rounded-3xl p-8 border border-stone-200 shadow-xl text-center space-y-4">
            <div className="w-14 h-14 bg-red-50 text-red-600 rounded-2xl flex items-center justify-center mx-auto border border-red-200">
              <AlertTriangle size={28} />
            </div>
            <h2 className="text-xl font-bold text-stone-900">
              Something went wrong loading this screen
            </h2>
            <p className="text-xs text-stone-500 font-mono bg-stone-100 p-3 rounded-xl break-all">
              {this.state.error?.message || 'Unexpected UI rendering issue'}
            </p>
            <div className="flex items-center justify-center gap-3 pt-2">
              <button
                onClick={this.handleReload}
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-600 text-white text-xs font-bold hover:bg-emerald-700 shadow-sm transition"
              >
                <RefreshCw size={14} /> Reload App
              </button>
              <button
                onClick={this.handleGoHome}
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-stone-100 text-stone-700 text-xs font-bold hover:bg-stone-200 transition"
              >
                <Home size={14} /> Back to Dashboard
              </button>
            </div>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}

export default ErrorBoundary
