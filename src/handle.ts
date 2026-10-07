/** A slot into one of the shim's tables. Destroyed handles stay around but refuse further use. */
export class Handle {
  /** False once destroy() ran, directly or through an owner. */
  alive = true;

  constructor(
    /** The shim's table slot; what event records and `raw` calls refer to. */
    readonly slot: number,
  ) {}

  protected assertAlive(what: string): void {
    if (!this.alive) throw new Error(`box3d: this ${what} was destroyed`);
  }
}
