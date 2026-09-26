export interface Orologio {
  ora(): Date;
}

export interface GeneratoreId {
  /** UUID generato dall'applicazione: serve prima dell'inserimento come dato associato della cifratura. */
  nuovo(): string;
}

export interface RilevamentoLingua {
  lingua: string | null;
  affidabile: boolean;
}

export interface RilevatoreLingua {
  rileva(testo: string): RilevamentoLingua;
}
