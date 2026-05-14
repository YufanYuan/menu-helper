import { Link } from '@tanstack/react-router';

const focusAreas = [
  'Product engineering',
  'AI-native tooling',
  'Edge and mini program systems',
];

export function HomePage() {
  return (
    <main>
      <section className="hero">
        <div className="hero-copy">
          <p className="eyebrow">Builder, product engineer, systems thinker</p>
          <h1>Yufan</h1>
          <p className="lede">
            I build focused software that makes everyday workflows lighter, faster, and easier to trust.
          </p>
          <div className="hero-actions" aria-label="Profile links">
            <a href="mailto:hello@example.com">Email</a>
            <Link to="/work">Work</Link>
          </div>
        </div>

        <aside className="profile-panel" aria-label="Current focus">
          <div className="profile-image" />
          <div>
            <p className="panel-label">Current focus</p>
            <ul>
              {focusAreas.map((area) => (
                <li key={area}>{area}</li>
              ))}
            </ul>
          </div>
        </aside>
      </section>
    </main>
  );
}
