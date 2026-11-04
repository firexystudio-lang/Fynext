'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');

const MAX_CONVERSATIONS = 100;

function historyPath() {
  const directory = process.env.APPDATA
    ? path.join(process.env.APPDATA, 'fynext')
    : path.join(os.homedir(), '.fynext');
  return path.join(directory, 'history.json');
}

function loadHistory(filePath) {
  try {
    const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    if (!Array.isArray(data)) throw new Error('Invalid conversation history format.');
    for (const conversation of data) {
      if (
        !conversation ||
        typeof conversation.id !== 'string' ||
        typeof conversation.updatedAt !== 'string' ||
        typeof conversation.title !== 'string' ||
        !Array.isArray(conversation.messages)
      ) {
        throw new Error('Invalid conversation history entry.');
      }
    }
    return data;
  } catch (err) {
    if (err.code === 'ENOENT') return [];
    throw new Error(`Could not read conversation history (${filePath}): ${err.message}`);
  }
}

function saveHistory(filePath, conversations, conversation) {
  const next = conversations.filter((item) => item.id !== conversation.id);
  next.push(conversation);
  next.sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt));
  next.length = Math.min(next.length, MAX_CONVERSATIONS);

  const directory = path.dirname(filePath);
  const temporaryPath = `${filePath}.${process.pid}.${crypto.randomBytes(6).toString('hex')}.tmp`;
  try {
    fs.mkdirSync(directory, { recursive: true });
    fs.writeFileSync(temporaryPath, JSON.stringify(next, null, 2) + '\n', 'utf8');
    fs.renameSync(temporaryPath, filePath);
  } catch (err) {
    try {
      fs.unlinkSync(temporaryPath);
    } catch (cleanupErr) {
      if (cleanupErr.code !== 'ENOENT') {
        throw new Error(`Could not save conversation history (${filePath}): ${err.message}; could not clean up temporary file: ${cleanupErr.message}`);
      }
    }
    throw new Error(`Could not save conversation history (${filePath}): ${err.message}`);
  }
  return next;
}

function createConversation() {
  return {
    id: crypto.randomUUID(),
    updatedAt: new Date().toISOString(),
    title: '',
    messages: []
  };
}

function removeConversation(filePath, conversations, id) {
  const next = conversations.filter((item) => item.id !== id);
  const directory = path.dirname(filePath);
  const temporaryPath = `${filePath}.${process.pid}.${crypto.randomBytes(6).toString('hex')}.tmp`;
  try {
    fs.mkdirSync(directory, { recursive: true });
    fs.writeFileSync(temporaryPath, JSON.stringify(next, null, 2) + '\n', 'utf8');
    fs.renameSync(temporaryPath, filePath);
  } catch (err) {
    try {
      fs.unlinkSync(temporaryPath);
    } catch (_) {
      /* cleanup best effort */
    }
    throw new Error(`Could not delete conversation history (${filePath}): ${err.message}`);
  }
  return next;
}

module.exports = { historyPath, loadHistory, saveHistory, createConversation, removeConversation };
