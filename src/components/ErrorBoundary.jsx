import React from "react";

export class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, info) {
    console.error(`[ErrorBoundary] ${this.props.name || "unknown"}:`, error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
          minHeight: 300, padding: 32, textAlign: "center", color: "rgba(255,255,255,.6)"
        }}>
          <div style={{ fontSize: 40, marginBottom: 16 }}>⚠</div>
          <div style={{ fontFamily: "'Anton',sans-serif", fontSize: 16, letterSpacing: 2, marginBottom: 8, color: "#fff" }}>
            SOMETHING WENT WRONG
          </div>
          <div style={{ fontFamily: "'Outfit',sans-serif", fontSize: 13, color: "rgba(255,255,255,.4)", marginBottom: 20, maxWidth: 280 }}>
            This section encountered an error. The rest of the app still works.
          </div>
          <button
            onClick={() => this.setState({ hasError: false, error: null })}
            style={{
              padding: "10px 24px", background: "rgba(255,255,255,.08)", border: "1px solid rgba(255,255,255,.15)",
              color: "#fff", fontFamily: "'Anton',sans-serif", fontSize: 11, letterSpacing: 2, cursor: "pointer"
            }}
          >
            TRY AGAIN
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
