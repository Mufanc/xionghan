export class SkinDrop {
    private depth = 0;
    private abort = new AbortController();

    constructor(
        target: EventTarget,
        private onHover: (hover: boolean) => void,
        private onDrop: (files: File[]) => void,
    ) {
        for (const type of ['dragenter', 'dragleave', 'dragover', 'drop', 'dragend']) {
            target.addEventListener(type, this.handle, { signal: this.abort.signal });
        }
    }

    dispose(): void {
        this.abort.abort();
        this.reset();
    }

    private reset(): void {
        this.depth = 0;
        this.onHover(false);
    }

    private handle = (event: Event): void => {
        if (event.type === 'dragend') {
            this.reset();
            return;
        }

        if (event.type === 'dragleave') {
            if (this.depth > 0 && --this.depth === 0) this.onHover(false);

            return;
        }

        const transfer = (event as DragEvent).dataTransfer;

        if (!transfer || (!transfer.types.includes('Files') && !transfer.files.length)) return;

        // 阻止浏览器把 ZIP 当作导航目标打开。
        event.preventDefault();

        if (event.type === 'dragenter') {
            this.depth++;
            this.onHover(true);
        } else if (event.type === 'dragover') {
            transfer.dropEffect = 'copy';
        } else if (event.type === 'drop') {
            this.reset();
            this.onDrop(Array.from(transfer.files));
        }
    };
}
