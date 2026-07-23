import { RestaurantConfirmationExperience } from "./restaurant-confirmation-client.jsx";

export default async function RestaurantConfirmationPage({ searchParams }) {
  const parameters = await searchParams;
  const language = parameters?.lang === "en" ? "en" : "ko";

  return <RestaurantConfirmationExperience initialLanguage={language} />;
}
