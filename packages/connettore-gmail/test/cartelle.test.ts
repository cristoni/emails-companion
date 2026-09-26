import { describe, expect, it } from "vitest";
import { cartelleDaEtichette } from "../src/cartelle";

describe("cartelleDaEtichette", () => {
  it.each([
    [["INBOX", "UNREAD", "CATEGORY_UPDATES"], ["in_arrivo"]],
    [["SENT"], ["inviata"]],
    [["SPAM"], ["spam"]],
    [["TRASH"], ["cestino"]],
    [["DRAFT"], ["bozza"]],
    [["CHAT"], ["chat"]],
    [["SENT", "INBOX"], ["in_arrivo", "inviata"]],
  ])("%j → %j", (etichette, attese) => {
    expect(cartelleDaEtichette(etichette)).toEqual(attese);
  });

  it("un messaggio senza cartelle di sistema è archiviato", () => {
    expect(cartelleDaEtichette(["IMPORTANT", "Label_12", "CATEGORY_PERSONAL"])).toEqual(["archiviata"]);
    expect(cartelleDaEtichette([])).toEqual(["archiviata"]);
  });
});
