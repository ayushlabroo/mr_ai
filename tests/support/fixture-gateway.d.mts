export const FIXTURE_MARKDOWN: string;
export function startFixtureGateway(): Promise<{
  origin: string;
  token: string;
  dispatchCount(): number;
  run(id: string):
    | {
        status: string;
        cost: number | null;
        held: number;
        markdown: string | null;
      }
    | undefined;
  close(): Promise<void>;
}>;
