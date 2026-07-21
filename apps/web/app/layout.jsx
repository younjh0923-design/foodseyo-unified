import "./globals.css";

export const metadata = {
  title: "Foodseyo",
  description: "Choose the restaurant that matches your menu photos.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
