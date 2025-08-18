export const encodeCursor = (nameId: number) =>
    Buffer.from(String(nameId), 'utf8').toString('base64');
  
  export const decodeCursor = (c?: string | null) => {
    if (!c) return null;
    const n = Number(Buffer.from(c, 'base64').toString('utf8'));
    return Number.isFinite(n) && n > 0 ? n : null;
  };
  