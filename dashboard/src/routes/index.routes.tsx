import { Hono } from 'hono';
import { Layout } from '../components/Layout';

type Env = {
  Variables: {
    projectDir: string;
  };
};

const router = new Hono<Env>();

router.get('/favicon.ico', (c) => {
  return c.body(null, 204);
});

router.get('/', (c) => {
  const isHtmx = c.req.header('HX-Request');

  if (isHtmx) {
    return c.html(
      <main id="main-content">
        <h1>Command Center</h1>
        <p>Project overview loads here.</p>
      </main>
    );
  }

  return c.html(
    <Layout title="Command Center" currentView="home">
      <h1>Command Center</h1>
      <p>Project overview loads here.</p>
    </Layout>
  );
});

export { router as indexRouter };
