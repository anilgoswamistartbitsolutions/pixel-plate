import "./globals.css";

export const metadata = {
  title: "Pixel Plate -- Restaurant Voice Agent & Reservations",
  description: "AI voice receptionist, reservation engine, and floor-plan management for restaurants."
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
