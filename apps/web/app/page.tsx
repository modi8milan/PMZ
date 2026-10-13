import Image from 'next/image';
import { StatusPanel } from '../components/status-panel';
import { Badge, Card, EmptyState, Field } from '../components/ui';

export default function Home() {
  return (
    <div className="app-shell">
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <aside className="sidebar">
        <div className="brand">
          <Image
            src="/brand/zenovel-logo.svg"
            alt="ZENOVEL Pharma Services"
            width={201}
            height={53}
            priority
          />
        </div>
        <div className="workspace-label">MONITORING PLATFORM</div>
        <nav aria-label="Foundation navigation">
          <a className="nav-item active" href="#main" aria-current="page">
            <span aria-hidden="true">◈</span>Foundation overview
          </a>
          <a className="nav-item" href="#design">
            <span aria-hidden="true">▦</span>Design foundations
          </a>
        </nav>
        <div className="sidebar-note">
          <span className="small-label">BUILD BOUNDARY</span>
          <p>Technical foundation</p>
          <small>Business workflows begin in later approved stages.</small>
        </div>
        <div className="sidebar-bottom">
          <span className="local-dot" />
          Local development<span className="version">v0.1</span>
        </div>
      </aside>
      <div className="workspace">
        <header className="topbar">
          <span>
            ZENOVEL <span className="separator">/</span> Foundation
          </span>
          <Badge tone="warning">Stage 1</Badge>
        </header>
        <main id="main">
          <div className="page-intro">
            <p className="eyebrow">A STRONG FOUNDATION FOR CONTROLLED WORK</p>
            <h1>
              Built on clarity.
              <br />
              <span>Ready for the next step.</span>
            </h1>
            <p className="intro-copy">
              The technical starting point for ZENOVEL’s monitoring and project
              management platform. Check connectivity and explore the shared
              design language.
            </p>
          </div>
          <div className="foundation-grid">
            <StatusPanel />
            <Card className="scope-card">
              <p className="eyebrow">THIS STAGE</p>
              <h2>Structure before workflow.</h2>
              <p>
                A focused foundation for a reliable, maintainable application.
              </p>
              <ul className="scope-list">
                <li>Separate frontend and API</li>
                <li>PostgreSQL connectivity & migrations</li>
                <li>Consistent interface components</li>
                <li>Initial security configuration</li>
              </ul>
              <div className="scope-footer">
                <Badge>Owner acceptance pending</Badge>
                <small>Stage 2 requires explicit approval.</small>
              </div>
            </Card>
          </div>
          <section id="design" className="design-section">
            <div className="section-heading">
              <div>
                <p className="eyebrow">SHARED DESIGN LANGUAGE</p>
                <h2>Simple, consistent, considered.</h2>
              </div>
              <span className="muted">Component preview</span>
            </div>
            <div className="preview-grid">
              <Card>
                <h3>Colour & hierarchy</h3>
                <p className="muted">
                  Website-derived brand accents with calm neutral surfaces.
                </p>
                <div className="swatches">
                  <div>
                    <span className="swatch brand-orange" />
                    Accent
                  </div>
                  <div>
                    <span className="swatch brand-dark" />
                    Ink
                  </div>
                  <div>
                    <span className="swatch brand-cream" />
                    Surface
                  </div>
                </div>
              </Card>
              <Card>
                <h3>Clear feedback</h3>
                <p className="muted">
                  Text and colour work together to communicate state.
                </p>
                <div className="badge-preview">
                  <Badge tone="success">Success</Badge>
                  <Badge tone="warning">Attention</Badge>
                  <Badge tone="error">Error</Badge>
                  <Badge>Pending</Badge>
                </div>
              </Card>
              <Card>
                <h3>Form foundation</h3>
                <Field
                  label="Example field"
                  id="example-field"
                  placeholder="Enter a value"
                  hint="Design preview only. This value is not saved."
                />
              </Card>
            </div>
            <Card className="empty-preview">
              <EmptyState title="A clean starting point">
                No business records are created in Stage 1. Project and report
                workflows will be introduced after their approval gates.
              </EmptyState>
            </Card>
          </section>
          <footer className="page-footer">
            <span>ZENOVEL Pharma Services</span>
            <span>Master Architecture v1.1 · Stage 1 only</span>
          </footer>
        </main>
      </div>
    </div>
  );
}
