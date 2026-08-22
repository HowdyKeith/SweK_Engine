// FILE: tools/selectionState.js
// VERSION: v1 - SIMPLE VOXEL SELECTION STATE

export class SelectionState {

    constructor() {
        this.active = false;

        this.x = 0;
        this.y = 0;
        this.z = 0;

        this.prevX = 0;
        this.prevY = 0;
        this.prevZ = 0;
    }

    set(hit) {
        this.active = true;

        this.x = hit.x;
        this.y = hit.y;
        this.z = hit.z;

        this.prevX = hit.prevX;
        this.prevY = hit.prevY;
        this.prevZ = hit.prevZ;
    }

    clear() {
        this.active = false;
    }
}