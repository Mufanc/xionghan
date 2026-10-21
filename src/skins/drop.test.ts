import { describe, expect, it, vi } from 'vitest';
import { SkinDrop } from '@/skins/drop';

function drag(target: EventTarget, type: string, files: File[] = [], types = ['Files']) {
    const event = new Event(type, { cancelable: true });
    Object.defineProperty(event, 'dataTransfer', { value: { types, files, dropEffect: 'none' } });
    target.dispatchEvent(event);
    return event;
}

describe('skin file drops', () => {
    it('prevents file navigation and keeps the indicator across nested elements', () => {
        const target = new EventTarget();
        const hover = vi.fn();
        const importFiles = vi.fn();
        const drop = new SkinDrop(target, hover, importFiles);
        expect(drag(target, 'dragenter').defaultPrevented).toBe(true);
        drag(target, 'dragenter');
        drag(target, 'dragleave');
        expect(hover).not.toHaveBeenCalledWith(false);
        const file = new File(['zip'], 'skin.zip');
        expect(drag(target, 'drop', [file]).defaultPrevented).toBe(true);
        expect(importFiles).toHaveBeenCalledExactlyOnceWith([file]);
        expect(hover).toHaveBeenLastCalledWith(false);
        drop.dispose();
        drag(target, 'drop', [file]);
        expect(importFiles).toHaveBeenCalledOnce();
    });
    it('only receives drops within its bound target', () => {
        const dialog = new EventTarget();
        const page = new EventTarget();
        const imported = vi.fn();
        const drop = new SkinDrop(dialog, vi.fn(), imported);
        const file = new File(['zip'], 'skin.zip');
        expect(drag(page, 'drop', [file]).defaultPrevented).toBe(false);
        expect(imported).not.toHaveBeenCalled();
        drag(dialog, 'drop', [file]);
        expect(imported).toHaveBeenCalledExactlyOnceWith([file]);
        drop.dispose();
    });
    it('ignores text drags and clears cancelled file drags', () => {
        const target = new EventTarget();
        const hover = vi.fn();
        const importFiles = vi.fn();
        const drop = new SkinDrop(target, hover, importFiles);
        expect(drag(target, 'drop', [], ['text/plain']).defaultPrevented).toBe(false);
        expect(importFiles).not.toHaveBeenCalled();
        drag(target, 'dragenter');
        drag(target, 'dragleave');
        expect(hover).toHaveBeenLastCalledWith(false);
        drag(target, 'dragenter');
        drag(target, 'dragend');
        expect(hover).toHaveBeenLastCalledWith(false);
        drop.dispose();
    });
});
