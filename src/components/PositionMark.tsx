export function PositionMark() {
    return (
        <svg className="position-mark" viewBox="0 0 100 100" aria-hidden="true">
            <path
                className="position-mark-outline"
                d="M5 20V5H20 M80 5H95V20 M95 80V95H80 M20 95H5V80"
            />
            <path d="M5 20V5H20 M80 5H95V20 M95 80V95H80 M20 95H5V80" />
        </svg>
    );
}
