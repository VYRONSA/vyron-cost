/**
 * Generates the VYRON_DEV_RESET_PASSWORD_HASH value for the Developer Supervisor
 * Reset Centre (PCP-045).
 *
 *   node scripts/generate-dev-reset-password-hash.mjs
 *
 * Reads the password without echoing it, prints only the hash, and never writes
 * the plaintext anywhere. Paste the output into .env.local and into your host's
 * environment configuration.
 */
import { randomBytes, scryptSync } from 'node:crypto'
import readline from 'node:readline'

function askHidden(question) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true })
    let first = true
    // Suppress echo: write the prompt once, then swallow every keystroke.
    rl._writeToOutput = function (str) {
      if (first) {
        rl.output.write(question)
        first = false
      } else if (str.includes('\n')) {
        rl.output.write('\n')
      }
    }
    rl.question(question, (answer) => {
      rl.close()
      resolve(answer)
    })
  })
}

const password = (await askHidden('Developer supervisor password: ')).trim()

if (password.length < 12) {
  console.error('\nRefused: use at least 12 characters for a destructive-action password.')
  process.exit(1)
}

const salt = randomBytes(16)
const hash = scryptSync(password, salt, 64)

console.log('\nAdd this to .env.local (and to your production environment):\n')
console.log(`VYRON_DEV_RESET_PASSWORD_HASH=scrypt$${salt.toString('hex')}$${hash.toString('hex')}`)
console.log('\nThe plaintext password was not stored or logged.')
