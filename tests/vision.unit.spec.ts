import { test, expect } from "@playwright/test";
import { parseGuesses } from "../src/framework/vision.ts";

test("parseGuesses ignores junk around the json", () => {
  const raw = `sure, here:
{"guesses":[{"id":"n1","name":"mic","hint":"composer","description":"right of the field"}]}
thanks`;
  expect(parseGuesses(raw)).toEqual([
    { id: "n1", name: "mic", hint: "composer", description: "right of the field" },
  ]);
});

test("parseGuesses drops empty names and unknown hints", () => {
  const raw = JSON.stringify({
    guesses: [
      { id: "a", name: "send", hint: "nope" },
      { id: "b", name: "" },
      { name: "mic" },
    ],
  });
  expect(parseGuesses(raw)).toEqual([{ id: "a", name: "send", hint: undefined, description: undefined }]);
});
