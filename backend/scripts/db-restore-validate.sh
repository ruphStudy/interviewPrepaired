#!/usr/bin/env bash
# Post-restore sanity check — connects via a tiny inline Node/mongoose
# script and prints document counts for a few key collections. No secrets
# are printed (the URI itself is passed to node via env, never echoed).
set -euo pipefail

if [ "${NODE_ENV:-}" = "production" ]; then
  MONGO_URI="${MONGODB_URI_PROD:-}"
  URI_VAR_NAME="MONGODB_URI_PROD"
else
  MONGO_URI="${MONGODB_URI:-}"
  URI_VAR_NAME="MONGODB_URI"
fi

if [ -z "${MONGO_URI}" ]; then
  echo "Refusing to run: ${URI_VAR_NAME} is not set in the environment." >&2
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

MONGO_URI="${MONGO_URI}" node -e "
const mongoose = require(require('path').join('${SCRIPT_DIR}', '..', 'node_modules', 'mongoose'));
const collections = ['users', 'organizations', 'paymentorders'];

(async () => {
  await mongoose.connect(process.env.MONGO_URI);
  console.log('Post-restore collection counts:');
  for (const name of collections) {
    try {
      const count = await mongoose.connection.db.collection(name).countDocuments();
      console.log('  ' + name + ': ' + count);
    } catch (err) {
      console.log('  ' + name + ': (unable to count — ' + err.message + ')');
    }
  }
  await mongoose.disconnect();
})().catch((err) => {
  console.error('Validation failed:', err.message);
  process.exit(1);
});
"
