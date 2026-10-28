// Where the headless render's bytes go (spec §21.6): the CLI's localhost server. A `PickedFile`, so the
// export job writes through the same `ExportFile` as an Export tab render that picked its file.
//   PUT  <base>sink/<name>?pos=<n>   the bytes at position n (the file grows as needed)
//   POST <base>sink/<name>?op=close  commits the file; ?op=abort discards it
//   PUT  <base>out/<path>            a small finished file (a PNG)
import type { FsWritable } from "../../project/fs.js";
import type { PickedFile } from "../../export/exportFile.js";

type SendLike = (url: string, init: { method: string; body?: Uint8Array | Blob }) => Promise<Response>;

const defaultSend: SendLike = (url, init) => fetch(url, init as RequestInit);

async function ok(response: Response, what: string): Promise<void> {
  if (!response.ok) throw new Error(`${what}: ${response.status} ${await response.text().catch(() => "")}`);
}

export class HttpSink implements PickedFile {
  constructor(
    /** The server's base URL for this run, ending in "/". */
    private readonly base: string,
    readonly name: string,
    private readonly send: SendLike = defaultSend,
  ) {}

  private url(op: string): string {
    return `${this.base}sink/${encodeURIComponent(this.name)}?${op}`;
  }

  async openWritable(): Promise<FsWritable> {
    return {
      write: async (data, position) => ok(await this.send(this.url(`pos=${position}`), { method: "PUT", body: data }), "write"),
      close: async () => ok(await this.send(this.url("op=close"), { method: "POST" }), "close"),
      abort: async () => ok(await this.send(this.url("op=abort"), { method: "POST" }), "abort"),
    };
  }

  async remove(): Promise<void> {
    await this.send(this.url("op=abort"), { method: "POST" }).catch(() => undefined);
  }
}

/** Uploads one finished file under `out/<path>` (a frame's PNG, a difference image). */
export async function putOutput(base: string, path: string, data: Blob | Uint8Array, send: SendLike = defaultSend): Promise<void> {
  await ok(await send(`${base}out/${path.split("/").map(encodeURIComponent).join("/")}`, { method: "PUT", body: data }), `upload ${path}`);
}
