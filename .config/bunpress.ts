import type { BunPressConfig } from 'bunpress'

const config: BunPressConfig = {
  name: 'ts-broadcasting',
  description: 'Real-time broadcasting for TypeScript',
  url: 'https://ts-broadcasting.stacksjs.org',

  theme: {
    primaryColor: '#8b5cf6',
  },

  sidebar: [
    {
      text: 'Introduction',
      link: '/',
    },
    {
      text: 'Guide',
      items: [
        { text: 'Getting Started', link: '/guide/getting-started' },
        { text: 'Channels', link: '/guide/channels' },
        { text: 'Events', link: '/guide/events' },
        { text: 'Laravel Echo', link: '/guide/echo' },
      ],
    },
    {
      text: 'Features',
      items: [
        { text: 'Private Channels', link: '/features/private-channels' },
        { text: 'Presence Channels', link: '/features/presence' },
        { text: 'Whisper Events', link: '/features/whisper' },
        { text: 'Client Events', link: '/features/client-events' },
      ],
    },
    {
      text: 'Advanced',
      items: [
        { text: 'Custom Drivers', link: '/advanced/drivers' },
        { text: 'Scaling', link: '/advanced/scaling' },
        { text: 'Security', link: '/advanced/security' },
        { text: 'Debugging', link: '/advanced/debugging' },
      ],
    },
  ],

  navbar: [
    { text: 'Home', link: '/' },
    { text: 'Guide', link: '/guide/getting-started' },
    { text: 'GitHub', link: 'https://github.com/stacksjs/ts-broadcasting' },
  ],

  socialLinks: [
    { icon: 'github', link: 'https://github.com/stacksjs/ts-broadcasting' },
    { icon: 'discord', link: 'https://discord.gg/stacksjs' },
    { icon: 'twitter', link: 'https://twitter.com/stacksjs' },
  ],
}

export default config
