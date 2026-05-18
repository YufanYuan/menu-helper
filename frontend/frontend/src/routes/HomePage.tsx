const menuMiniappQrUrl = new URL(
  '../../statics/imgs/menu-miniapp-qr.png',
  import.meta.url,
).href;

const apps = [
  {
    title: "Texas Hold'em",
    description: '德州扑克 with on-device AI players',
  },
  {
    title: '菜单拍照小程序',
    description: '拍照识别菜单，快速整理点单。',
    imageUrl: menuMiniappQrUrl,
    imageAlt: '菜单拍照小程序码',
  },
];

export function HomePage() {
  return (
    <main className="home-page">
      <div className="home-content">
        <section className="intro" aria-labelledby="profile-title">
          <p className="eyebrow">Personal homepage</p>
          <h1 id="profile-title">I'm Frank Yuan</h1>
        </section>

        <section className="app-grid" aria-label="Portfolio">
          {apps.map((app) => (
            <article className="app-card" key={app.title}>
              {app.imageUrl ? (
                <img className="app-qr" src={app.imageUrl} alt={app.imageAlt} />
              ) : (
                <div className="poker-mark" aria-hidden="true">
                  AI
                </div>
              )}
              <div>
                <h2>{app.title}</h2>
                <p>{app.description}</p>
              </div>
            </article>
          ))}
        </section>
      </div>

      <footer className="beian-footer" aria-label="备案信息">
        <p className="police-beian">
          <img alt="" aria-hidden="true" src="/assets/image/head-logo.png" width="20" />
          <a
            href="https://beian.mps.gov.cn/#/query/webSearch?code=31011002004975"
            rel="noreferrer"
            target="_blank"
          >
            沪公网安备31011002004975号
          </a>
        </p>
        <a href="https://beian.miit.gov.cn/" rel="noreferrer" target="_blank">
          沪ICP备20003331号-1
        </a>
      </footer>
    </main>
  );
}
