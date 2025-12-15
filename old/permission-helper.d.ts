#!/usr/bin/env node
export interface PermissionStatus {
    screen: 'authorized' | 'denied' | 'not-determined';
    accessibility: 'authorized' | 'denied' | 'not-determined';
    nodePath: string;
    needsSymlink: boolean;
}
export declare class PermissionHelper {
    private static instance;
    private nodePath;
    private needsSymlink;
    private constructor();
    static getInstance(): PermissionHelper;
    private findNodePath;
    private checkIfNeedsSymlink;
    checkPermissions(): Promise<PermissionStatus>;
    private checkScreenPermission;
    private checkAccessibilityPermission;
    generatePermissionInstructions(): string;
    createSymlink(): Promise<boolean>;
    openSystemSettings(): void;
    openSymlinkDirectory(): void;
}
export declare const permissionHelper: PermissionHelper;
//# sourceMappingURL=permission-helper.d.ts.map