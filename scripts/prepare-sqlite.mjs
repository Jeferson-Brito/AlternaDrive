import { config } from 'dotenv'
import { copyFileSync, constants, openSync, closeSync } from 'node:fs'
import { resolve } from 'node:path'

if (!process.env.DATABASE_URL) {
  try {
    copyFileSync('.env.example', '.env', constants.COPYFILE_EXCL)
  } catch (error) {
    if (error.code !== 'EEXIST') throw error
  }
  config()
}
const url = process.env.DATABASE_URL
if (!url?.startsWith('file:')) {
  throw new Error('Para o SQLite local, defina DATABASE_URL a partir de .env.example.')
}
// Create the file without truncating existing data. Prisma applies the migrations next.
closeSync(openSync(resolve('prisma', url.slice('file:'.length)), 'a'))
