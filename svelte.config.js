import preprocess from 'svelte-preprocess'
import adapter from '@sveltejs/adapter-static'

/** @type {import('@sveltejs/kit').Config} */
const config = {
  preprocess: preprocess({
    postcss: true
  }),
  kit: {
    adapter: adapter({
      fallback: 'index.html'
    }),
    prerender: {
      // use relative URLs similar to an anchor tag <a href="/test/1"></a>
      // do not include group layout folders in the path such as /(group)/test/1
      entries: [
        '*',
        '/filecoin/connect',
        '/filecoin/help',
        '/filecoin/intro',
        '/filecoin/leaderboard',
        '/filecoin/monitor',
        '/filecoin/play',
        '/filecoin/profile',
        '/filecoin/vote',
        '/optimism/connect',
        '/optimism/help',
        '/optimism/intro',
        '/optimism/leaderboard',
        '/optimism/monitor',
        '/optimism/play',
        '/optimism/profile',
        '/optimism/vote',
      ]
    }
  }
}

export default config
