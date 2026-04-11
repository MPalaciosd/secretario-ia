require('dotenv').config();
const express = require('express');
const { Pool } = require('pg');
const { startServer } = require('./src/api/server');
const { initializeDatabase } = require('./src/db/database');
const config = require('./src/config');

async function main() {
  console.log('\n🧠 Secretario IA — Backend Inteligente');
  console.log('─'.repeat(45));
  
  // Initialize PostgreSQL database
  await initializeDatabase();
  
  // Start Express server
  startServer();
  
  console.log('\n✅ Sistema operativo.\n');
}

main().catch(err => {
  console.error('[FATAL] Error al iniciar:', err.message);
  process.exit(1);
});

process.on('uncaughtException', (err) => {
  console.error('[ERROR] Excepción no capturada:', err.message);
  if (err.code === 'EADDRINUSE') process.exit(1);
});

process.on('unhandledRejection', (reason) => {
  console.error('[ERROR] Promesa rechazada:', reason);
});

async function shutdown(signal) {
  console.log(`\n[Shutdown] ${signal} — cerrando limpiamente...`);
  const { getPool } = require('./src/db/database');
  const pool = getPool();
  if (pool) await pool.end();
  process.exit(0);
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
