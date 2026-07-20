const STREAM_BY_LEVEL = {
  error: "error",
  warn: "log",
  info: "log",
};

function safePayload(payload) {
  try {
    return JSON.stringify(payload);
  } catch {
    return JSON.stringify({
      timestamp: payload.timestamp,
      level: payload.level,
      event: payload.event,
      serializationFailed: true,
    });
  }
}

function write(level, event, data = {}) {
  const payload = {
    ...data,
    timestamp: new Date().toISOString(),
    level,
    event,
  };

  const stream = STREAM_BY_LEVEL[level] || "log";
  console[stream](safePayload(payload));
}

export function logInfo(event, data = {}) {
  write("info", event, data);
}

export function logWarn(event, data = {}) {
  write("warn", event, data);
}

export function logError(event, data = {}) {
  write("error", event, data);
}
