// There are no accounts yet, so every reminder belongs to this one user. Sign-in will replace this.
async function currentUserId() {
  return "local-user"
}

export { currentUserId }
