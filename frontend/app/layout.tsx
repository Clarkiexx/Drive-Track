import type { Metadata, Viewport } from "next";
import { Bricolage_Grotesque, Public_Sans } from "next/font/google";
import { Toaster } from "sonner";

import AppShell from "@/components/common/AppShell";
import { AuthProvider } from "@/context/AuthContext";

import "./globals.css";

const display = Bricolage_Grotesque({
  subsets: ["latin"],
  variable: "--font-bricolage",
  display: "swap",
});

const sans = Public_Sans({
  subsets: ["latin"],
  variable: "--font-public-sans",
  display: "swap",
});

export const metadata: Metadata = {
  title: "DriveTrack",
  description:
    "DriveTrack is the CTMO citation app: drivers review and settle their violations, and traffic enforcers issue citations and search driver records from the field.",
  applicationName: "DriveTrack",
  // app/manifest.ts is served here; stated explicitly so installability never
  // depends on framework behaviour.
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: "DriveTrack",
    // The brand band runs under the status bar, so content needs the dark text.
    statusBarStyle: "black-translucent",
  },
  formatDetection: {
    // Citation numbers and phone numbers should not auto-link into the dialer.
    telephone: false,
    date: false,
    address: false,
    email: false,
  },
  icons: {
    icon: [
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/apple-icon.png", sizes: "180x180", type: "image/png" }],
  },
};

export const viewport: Viewport = {
  themeColor: "#1B5E20",
  width: "device-width",
  initialScale: 1,
  // Lets the brand band reach the notch; MobileHeader and AppBar pad themselves
  // back with env(safe-area-inset-top).
  viewportFit: "cover",
  // Locked to light. This app renders official records on white cards over a
  // green band, so a dark-mode phone must not repaint those surfaces.
  colorScheme: "light",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      className={`${display.variable} ${sans.variable} h-full antialiased`}
      style={{ colorScheme: "light" }}
    >
      <body className="flex min-h-full flex-col">
        <AuthProvider>
          {/* AppShell puts the driver/enforcer/auth routes inside the phone
              frame and lets /admin fill the browser — the admin console brings
              its own sidebar and topbar. */}
          <AppShell>{children}</AppShell>
        </AuthProvider>

        {/* Sonner renders into a fixed container, so it is capped at the same
            width as the phone shell to stay inside the frame on wide screens.
            Toasts rise from just above the tab bar rather than covering the
            header. */}
        <Toaster
          position="bottom-center"
          closeButton
          duration={4200}
          offset={{ bottom: "calc(var(--nav-height) + env(safe-area-inset-bottom, 0px) + 14px)" }}
          style={{ width: "100%", maxWidth: "28rem" }}
        />
      </body>
    </html>
  );
}