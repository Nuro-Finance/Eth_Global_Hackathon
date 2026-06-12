import fs from "fs";
import path from "path";

export function loadDeployments(networkName: string): Record<string, string> {
  const file = path.join(__dirname, `../../deployments/${networkName}.json`);
  if (!fs.existsSync(file)) throw new Error(`No deployments found for network: ${networkName}`);
  return JSON.parse(fs.readFileSync(file, "utf8"));
}
