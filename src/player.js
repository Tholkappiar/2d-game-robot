import * as THREE from 'three';
import { createRobotSprite, ledgeGrip, robotFrames } from './robot-sprites.js';
import { surfaceHeight } from './platforms.js';

// A calm walk: slower top speed, eased in and out (see walkVelocity in step()).
const walkSpeed = 0.62;
const easeIn = 3.2;
const easeOut = 5;
const gravity = 4.5;
const climbDuration = 0.55;
const edgeClearance = 0.001;

export function createPlayer({ floorY, spawnX, platforms, bounds, jumpSpeed = 1.32 }) {
  const root = new THREE.Group();
  const sprite = createRobotSprite();
  root.add(sprite.mesh);

  const floors = platforms ?? [{ left: -Infinity, right: Infinity, y: floorY }];
  const groundAt = position => floors.find(({ left, right }) => position >= left && position <= right);
  const spawnY = surfaceHeight(groundAt(spawnX), spawnX);
  const respawnY = Math.min(...floors.map(({ y, endY = y }) => Math.min(y, endY))) - 0.37;
  const walkable = floors.map(platform => ({
    platform,
    wallLeft: !floors.some(other => other.right === platform.left && (other.endY ?? other.y) === platform.y),
    wallRight: !floors.some(other => other.left === platform.right && other.y === (platform.endY ?? platform.y)),
  }));

  let x, y, velocityY, walkVelocity, grounded, animation, frameTime, ledge, climbTime;

  function reset() {
    x = spawnX;
    y = spawnY;
    velocityY = 0;
    walkVelocity = 0;
    grounded = true;
    animation = 'idle';
    frameTime = 0;
    ledge = null;
    climbTime = null;
    sprite.mesh.scale.x = 1;
    sprite.show(robotFrames.idle[0]);
  }
  reset();

  function climb(delta, direction, jump) {
    if (climbTime === null && !jump) {
      if (direction < 0) ledge = null;
      return;
    }

    climbTime = (climbTime ?? 0) + delta;
    const rise = Math.min(climbTime / (climbDuration * 0.65), 1);
    const across = THREE.MathUtils.smoothstep(climbTime / climbDuration, 0.65, 1);
    const stepX = Math.min(ledge.left + 0.12, (ledge.left + ledge.right) / 2);
    y = ledge.y - ledgeGrip.y * (1 - rise);
    x = THREE.MathUtils.lerp(ledge.left - ledgeGrip.x, stepX, across);

    if (climbTime >= climbDuration) {
      ledge = null;
      climbTime = null;
      grounded = true;
      sprite.show(robotFrames.idle[0]);
    } else if (across > 0) {
      sprite.show(robotFrames.mantle);
    } else {
      const poses = robotFrames.pull;
      sprite.show(poses[Math.round(rise * (poses.length - 1))]);
    }
  }

  return {
    root,
    spawnX,
    get x() { return x; },
    get grounded() { return grounded; },
    get hanging() { return ledge !== null && climbTime === null; },
    get terrainY() {
      const floor = groundAt(x);
      return floor ? surfaceHeight(floor, x) : y;
    },
    get jumpHeight() { return y - spawnY; },
    reset,
    step(delta, direction, jump) {
      if (ledge) {
        climb(delta, direction, jump);
        return;
      }

      if (direction) sprite.mesh.scale.x = direction;
      if (jump && grounded) {
        velocityY = jumpSpeed;
        grounded = false;
      }

      walkVelocity = THREE.MathUtils.damp(walkVelocity, direction * walkSpeed, direction ? easeIn : easeOut, delta);
      if (Math.abs(walkVelocity) < 0.005) walkVelocity = 0;
      let nextX = x + walkVelocity * delta;
      if (bounds) nextX = THREE.MathUtils.clamp(nextX, bounds.left, bounds.right);
      const nextVelocity = velocityY - gravity * delta;
      let nextY = grounded ? y : y + nextVelocity * delta;
      const currentFloor = groundAt(x);
      const destination = groundAt(nextX);
      const followsGround = grounded && destination && currentFloor && (
        currentFloor === destination ||
        (currentFloor.right === destination.left && (currentFloor.endY ?? currentFloor.y) === destination.y) ||
        (destination.right === currentFloor.left && (destination.endY ?? destination.y) === currentFloor.y)
      );
      if (followsGround) nextY = surfaceHeight(destination, nextX);

      for (const { platform, wallLeft, wallRight } of walkable) {
        const gripX = platform.left - ledgeGrip.x;
        if (platform.grabLeft && !grounded && nextX > x && x <= gripX && nextX >= gripX) {
          const contactY = THREE.MathUtils.lerp(y, nextY, (gripX - x) / (nextX - x));
          if (contactY < platform.y && contactY + ledgeGrip.y >= platform.y - 0.018) {
            ledge = platform;
            x = gripX;
            y = platform.y - ledgeGrip.y;
            velocityY = 0;
            sprite.show(robotFrames.pull[0]);
            return;
          }
        }
        if (wallLeft && nextY < platform.y && x < platform.left && nextX >= platform.left) {
          nextX = platform.left - edgeClearance;
        } else if (wallRight && nextY < (platform.endY ?? platform.y) && x > platform.right && nextX <= platform.right) {
          nextX = platform.right + edgeClearance;
        }
      }

      const previousX = x;
      x = nextX;
      const floor = groundAt(x);
      const height = floor && surfaceHeight(floor, x);
      if (floor && (followsGround || (
        y >= surfaceHeight(floor, THREE.MathUtils.clamp(previousX, floor.left, floor.right)) && nextY <= height
      ))) {
        y = height;
        grounded = true;
        velocityY = 0;
      } else {
        y = nextY;
        grounded = false;
        velocityY = nextVelocity;
      }
      if (y < respawnY) {
        reset();
        return;
      }

      const moving = Math.abs(walkVelocity) > 0.06;
      const nextAnimation = grounded ? (moving ? 'run' : 'idle') : (velocityY > 0 ? 'rise' : 'fall');
      frameTime = nextAnimation === animation ? frameTime + delta : 0;
      animation = nextAnimation;
      const frames = robotFrames[animation];
      // Step rate follows the actual speed, so the feet slow down as the robot eases to a stop.
      const rate = animation === 'run' ? 3 + 8 * Math.abs(walkVelocity) / walkSpeed : 2;
      sprite.show(Array.isArray(frames) ? frames[Math.floor(frameTime * rate) % frames.length] : frames);
    },
    draw(cameraX) {
      root.position.set(x - cameraX, y, 0);
    },
  };
}
