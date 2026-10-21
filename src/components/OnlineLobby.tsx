import { useEffect, useRef, useState } from 'react';
import { parseRoom } from '@/network/peer-room';

export function OnlineLobby({
    onClose,
    onStart,
}: {
    onClose: () => void;
    onStart: (target: string | null) => void;
}) {
    const dialog = useRef<HTMLDialogElement>(null);
    const [invitation, setInvitation] = useState('');
    const target = parseRoom(invitation);

    useEffect(() => {
        dialog.current?.showModal();
    }, []);

    return (
        <dialog
            className="online-lobby"
            ref={dialog}
            onCancel={onClose}
            onClick={(event) => {
                if (event.target === dialog.current) onClose();
            }}
            aria-labelledby="online-title"
        >
            <h2 id="online-title">联机对弈</h2>
            <p>邀请者执红，加入者执黑，从默认布局开始。</p>
            <button className="ui-button primary" onClick={() => onStart(null)}>
                创建邀请
            </button>
            <form
                onSubmit={(event) => {
                    event.preventDefault();
                    if (target) onStart(target);
                }}
            >
                <label htmlFor="invitation">加入对局</label>
                <input
                    id="invitation"
                    placeholder="粘贴邀请链接或 ID"
                    value={invitation}
                    onChange={(event) => setInvitation(event.target.value)}
                    autoComplete="off"
                />
                <button className="ui-button" disabled={!target}>
                    加入
                </button>
            </form>
            <p>对弈期间请保留页面。离开或刷新后需重新邀请；短暂断线可在原页面重连。</p>
            <button className="ui-button quiet" onClick={onClose}>
                取消
            </button>
        </dialog>
    );
}
