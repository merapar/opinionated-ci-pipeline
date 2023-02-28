export const assertUnreachable = (x: never): never => {
    throw new Error('Unsupported option:' + String(x));
};

export const notEmpty = <TValue>(value: TValue | null | undefined): value is TValue =>
    value !== null && value !== undefined;
