// FILE: ai/AICommandValidator.js
// VERSION: v1 - SAFETY GATE FOR AI OUTPUT

export class AICommandValidator {

    static validate(cmd) {

        if (!cmd || typeof cmd !== "object") return false;
        if (!cmd.type) return false;

        switch (cmd.type) {

            case "voxel:set":
            case "voxel:remove":

                return Number.isFinite(cmd.x)
                    && Number.isFinite(cmd.y)
                    && Number.isFinite(cmd.z);

            case "entity:move":

                return cmd.id != null;

            case "camera:set":

                return !!cmd.camera;

            default:
                return false;
        }
    }

    static filter(commands = []) {

        return commands.filter(c => this.validate(c));
    }
}