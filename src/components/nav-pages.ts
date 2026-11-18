export interface NavPage {
  name: string;
  shortName: string;
  href: string;
  description: string;
}

export const NAV_PAGES: NavPage[] = [
  {
    name: "Clipboard",
    shortName: "Clipboard",
    href: "/",
    description: "Save and retrieve encrypted text, Markdown, code, or images",
  },
  {
    name: "Live Sync",
    shortName: "Live",
    href: "/live-clipboard",
    description: "Real-time collaborative clipboard & image room",
  },
  {
    name: "Scribble",
    shortName: "Scribble",
    href: "/scribble",
    description: "Real-time collaborative drawing board",
  },
  {
    name: "File Drop",
    shortName: "Files",
    href: "/file-drop",
    description: "Instant file sharing up to 98 MB with expiry & QR",
  },
  {
    name: "URL Shortener",
    shortName: "URL",
    href: "/url",
    description: "Shorten links with browser, OS, and device analytics",
  },
  {
    name: "Shortcuts",
    shortName: "API",
    href: "/shortcuts",
    description: "Apple Shortcuts, Android HTTP Shortcuts, and CLI sync",
  },
  {
    name: "Vault",
    shortName: "Vault",
    href: "/vault",
    description: "Local clip history and protected admin vault",
  },
];
