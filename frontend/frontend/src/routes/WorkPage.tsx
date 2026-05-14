const projects = [
  {
    title: 'Menu Helper',
    detail: 'A mini program for recognizing menus and turning group choices into shareable orders.',
  },
  {
    title: 'Cloudflare Edge',
    detail: 'A lightweight edge proxy for OpenRouter traffic, telemetry, and WeChat session exchange.',
  },
  {
    title: 'CN Backend',
    detail: 'A uv-managed FastAPI service reserved for China-region API traffic and deployment.',
  },
];

export function WorkPage() {
  return (
    <main className="page">
      <section className="section-heading">
        <p className="eyebrow">Selected systems</p>
        <h1>Work</h1>
      </section>

      <section className="project-grid" aria-label="Projects">
        {projects.map((project) => (
          <article className="project-card" key={project.title}>
            <h2>{project.title}</h2>
            <p>{project.detail}</p>
          </article>
        ))}
      </section>
    </main>
  );
}
