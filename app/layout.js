// The website itself is public/index.html (served as-is). This layout only wraps the few app pages (like 404).
export const metadata = { title: 'VVM Details' };

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
