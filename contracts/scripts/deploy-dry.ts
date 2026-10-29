import { runDeploy } from "./lib/deploy-core";
import { GasPolicyError } from "./lib/sepolia-gas";

runDeploy({ dryRun: true }).catch((error) => {
  if (error instanceof GasPolicyError) {
    console.error(`${error.code}: ${error.message}`);
    if (Object.keys(error.details).length > 0) {
      console.error(JSON.stringify(error.details, null, 2));
    }
  } else {
    console.error(error);
  }
  process.exitCode = 1;
});
