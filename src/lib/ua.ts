export interface ParsedUserAgent {
  browser: string;
  os: string;
  deviceType: string;
}

export function parseUserAgent(ua: string | null | undefined): ParsedUserAgent {
  if (!ua) {
    return { browser: "Unknown", os: "Unknown", deviceType: "Unknown" };
  }

  let browser = "Other";
  if (/Edg\//i.test(ua)) browser = "Edge";
  else if (/OPR\/|Opera/i.test(ua)) browser = "Opera";
  else if (/Firefox\//i.test(ua)) browser = "Firefox";
  else if (/Chrome\//i.test(ua) && !/Chromium/i.test(ua)) browser = "Chrome";
  else if (/Safari\//i.test(ua) && !/Chrome/i.test(ua)) browser = "Safari";
  else if (/curl\//i.test(ua)) browser = "cURL";
  else if (/bot|crawl|spider|slurp/i.test(ua)) browser = "Bot";

  let os = "Other";
  if (/Windows NT/i.test(ua)) os = "Windows";
  else if (/iPhone|iPad|iPod/i.test(ua)) os = "iOS";
  else if (/Mac OS X|Macintosh/i.test(ua)) os = "macOS";
  else if (/Android/i.test(ua)) os = "Android";
  else if (/Linux/i.test(ua)) os = "Linux";

  let deviceType = "Desktop";
  if (/iPad|Tablet|PlayBook/i.test(ua) || (/Android/i.test(ua) && !/Mobile/i.test(ua))) {
    deviceType = "Tablet";
  } else if (/Mobile|iPhone|iPod|Android.*Mobile/i.test(ua)) {
    deviceType = "Mobile";
  } else if (/bot|crawl|spider|curl/i.test(ua)) {
    deviceType = "CLI / Bot";
  }

  return { browser, os, deviceType };
}
