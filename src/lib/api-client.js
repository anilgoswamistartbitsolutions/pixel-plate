"use client";

export function getToken() {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("pp_token");
}

export function getStaff() {
  if (typeof window === "undefined") return null;
  try {
    return JSON.parse(localStorage.getItem("pp_staff") || "null");
  } catch {
    return null;
  }
}

export function clearSession() {
  localStorage.removeItem("pp_token");
  localStorage.removeItem("pp_staff");
}

export async function apiFetch(path, options = {}) {
  const token = getToken();
  const response = await fetch(path, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {})
    },
    cache: "no-store"
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(payload.error?.message || "Request failed");
    error.status = response.status;
    error.details = payload.error?.details;
    throw error;
  }
  return payload.data;
}
