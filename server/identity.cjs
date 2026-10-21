const { randomBytes, createHash } = require('node:crypto');

function identity(ctx, trustedProxies, create = false) {
    let token = ctx.cookies.get('xionghan_identity', { signed: false });

    if (!/^[a-f0-9]{64}$/.test(token ?? '')) {
        if (!create) return null;

        token = randomBytes(32).toString('hex');
        const secure =
            ctx.secure ||
            (trustedProxies.has(ctx.req.socket.remoteAddress) &&
                ctx.get('x-forwarded-proto') === 'https');
        ctx.append(
            'Set-Cookie',
            `xionghan_identity=${token}; Path=/games/XiongHan; HttpOnly; SameSite=Lax; Max-Age=31536000${secure ? '; Secure' : ''}`,
        );
    }

    return createHash('sha256').update(token).digest('hex');
}

function ownedSeat(db, matchID, owner) {
    const metadata = db.metadata.get(matchID);
    if (!owner || !metadata || db.deleting.has(matchID)) return null;

    return (
        Object.values(metadata.players).find((player) => {
            const seat = db.owners.get(matchID)?.[player.id];
            return (
                player.name && seat?.identity === owner && seat.credentials === player.credentials
            );
        }) ?? null
    );
}

module.exports = { identity, ownedSeat };
