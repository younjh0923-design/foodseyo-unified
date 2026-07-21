import { RestaurantResolutionSchema } from "@foodseyo/contracts";
import fixture from "../../fixtures/restaurant-confirmation-ui.valid.json";
import {
  addLocalPhoto,
  buildRestaurantSelectionScreen,
  createLocalInputDraft,
  preserveLinkInput,
} from "../../src/index.js";
import { RestaurantConfirmationExperience } from "./restaurant-confirmation-client.jsx";

const buildDraft = () => {
  let draft = preserveLinkInput(createLocalInputDraft(), fixture.draft.linkInput);
  for (const photo of fixture.draft.photos) {
    draft = addLocalPhoto(draft, photo.clientId, photo.byteCount);
  }
  return draft;
};

const draft = buildDraft();
const screens = Object.fromEntries(
  Object.entries(fixture.resolutions).map(([state, resolution]) => [
    state,
    buildRestaurantSelectionScreen(
      draft,
      RestaurantResolutionSchema.parse(resolution),
    ),
  ]),
);

export default function RestaurantConfirmationPage() {
  return <RestaurantConfirmationExperience screens={screens} />;
}
