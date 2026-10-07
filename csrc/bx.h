// Shared contract of the flat C shim over Box3D (https://github.com/erincatto/box3d).
//
// JavaScript never sees a Box3D id. Every world, body, shape and joint is an
// integer slot into a table here; slot 0 is null. Each b3 object's userData is
// its own slot so events and query callbacks map straight back. Every bx_*
// entry point takes and returns scalars only. Structs come back through the
// scratch buffer and go in through the def buffer; bulk data (hull points,
// events, query hits) lives in buffers the frontend reads via HEAPF32.
#pragma once

#include "box3d/box3d.h"
#include "box3d/collision.h"
#include "box3d/math_functions.h"

#include <emscripten/emscripten.h>
#include <stdint.h>

#define BX_EXPORT EMSCRIPTEN_KEEPALIVE

// ---------------------------------------------------------------------------
// Slot tables
// ---------------------------------------------------------------------------

typedef struct bxTable
{
	void* items;
	int itemSize;
	int count;
	int capacity;
	int* freeList;
	int freeCount;
} bxTable;

int bxTable_Alloc( bxTable* table );
void bxTable_Free( bxTable* table, int slot );
void* bxTable_Get( bxTable* table, int slot );

typedef struct bxWorld
{
	b3WorldId id;
	int alive;
} bxWorld;

typedef struct bxBody
{
	b3BodyId id;
	int world;
	int alive;
} bxBody;

typedef struct bxShape
{
	b3ShapeId id;
	int body;
	int alive;
} bxShape;

typedef struct bxJoint
{
	b3JointId id;
	int world;
	int alive;
	b3JointType type;
} bxJoint;

extern bxTable bx_worlds;
extern bxTable bx_bodies;
extern bxTable bx_shapes;
extern bxTable bx_joints;

b3WorldId bxWorldId( int slot );
b3BodyId bxBodyId( int slot );
b3ShapeId bxShapeId( int slot );
b3JointId bxJointId( int slot );
bxJoint* bxJointAt( int slot );

int bxBodySlotOf( b3BodyId id );
int bxShapeSlotOf( b3ShapeId id );
int bxBodySlotOfShape( b3ShapeId id );
int bxJointSlotOf( b3JointId id );

// ---------------------------------------------------------------------------
// Scratch (struct returns) and def buffer (struct inputs)
// ---------------------------------------------------------------------------

#define BX_SCRATCH_WORDS 64
#define BX_DEF_WORDS 128

typedef union bxWord
{
	float f;
	uint32_t u;
	int32_t i;
} bxWord;

extern bxWord bx_scratch[BX_SCRATCH_WORDS];
extern bxWord bx_def[BX_DEF_WORDS];

void bxScratchVec3( int at, b3Vec3 v );
void bxScratchQuat( int at, b3Quat q );
void bxScratchTransform( int at, b3Transform xf );
void bxScratchMat3( int at, b3Matrix3 m );
b3Vec3 bxDefVec3( int at );
b3Quat bxDefQuat( int at );
b3Transform bxDefTransform( int at );
void bxDefSetVec3( int at, b3Vec3 v );
void bxDefSetQuat( int at, b3Quat q );
void bxDefSetTransform( int at, b3Transform xf );
uint64_t bxDefU64( int lo );
void bxDefSetU64( int lo, uint64_t v );
int bxDefFlag( int at, int bit );
void bxDefSetFlag( int at, int bit, int on );

// Def buffer layouts. Word indices; mirrored in src/runtime/layouts.ts and
// checked by test/exports.test.ts through the bx_Layout_* exports.

enum bxWorldDefLayout
{
	BX_WD_GRAVITY = 0, // 3 floats
	BX_WD_RESTITUTION_THRESHOLD = 3,
	BX_WD_HIT_EVENT_THRESHOLD = 4,
	BX_WD_CONTACT_HERTZ = 5,
	BX_WD_CONTACT_DAMPING_RATIO = 6,
	BX_WD_CONTACT_SPEED = 7,
	BX_WD_MAXIMUM_LINEAR_SPEED = 8,
	BX_WD_RESTITUTION_ITERATIONS = 9, // i32
	BX_WD_WORKER_COUNT = 10,		  // u32
	BX_WD_FLAGS = 11,				  // u32
	BX_WD_CAPACITY = 12,			  // 5 i32: static shapes, dynamic shapes, static bodies, dynamic bodies, contacts
	BX_WD_WORDS = 17,
};

enum bxWorldDefFlags
{
	BX_WD_ENABLE_SLEEP = 0,
	BX_WD_ENABLE_CONTINUOUS = 1,
	BX_WD_ENABLE_RESTITUTION_PROPAGATION = 2,
};

enum bxBodyDefLayout
{
	BX_BD_TYPE = 0, // u32: 0 static, 1 kinematic, 2 dynamic
	BX_BD_POSITION = 1,
	BX_BD_ROTATION = 4,
	BX_BD_LINEAR_VELOCITY = 8,
	BX_BD_ANGULAR_VELOCITY = 11,
	BX_BD_LINEAR_DAMPING = 14,
	BX_BD_ANGULAR_DAMPING = 15,
	BX_BD_GRAVITY_SCALE = 16,
	BX_BD_SLEEP_THRESHOLD = 17,
	BX_BD_SAFETY_FACTOR = 18,
	BX_BD_FLAGS = 19, // u32
	BX_BD_WORDS = 20,
};

enum bxBodyDefFlags
{
	BX_BD_ENABLE_SLEEP = 0,
	BX_BD_IS_AWAKE = 1,
	BX_BD_IS_BULLET = 2,
	BX_BD_IS_ENABLED = 3,
	BX_BD_ALLOW_FAST_ROTATION = 4,
	BX_BD_ENABLE_CONTACT_RECYCLING = 5,
	BX_BD_LOCK_LINEAR_X = 6,
	BX_BD_LOCK_LINEAR_Y = 7,
	BX_BD_LOCK_LINEAR_Z = 8,
	BX_BD_LOCK_ANGULAR_X = 9,
	BX_BD_LOCK_ANGULAR_Y = 10,
	BX_BD_LOCK_ANGULAR_Z = 11,
};

enum bxShapeDefLayout
{
	BX_SD_DENSITY = 0,
	BX_SD_FRICTION = 1,
	BX_SD_RESTITUTION = 2,
	BX_SD_ROLLING_RESISTANCE = 3,
	BX_SD_TANGENT_VELOCITY = 4, // 3 floats
	BX_SD_EXPLOSION_SCALE = 7,
	BX_SD_USER_MATERIAL_ID = 8, // u64 as lo, hi
	BX_SD_CATEGORY_BITS = 10,	// u64 as lo, hi
	BX_SD_MASK_BITS = 12,		// u64 as lo, hi
	BX_SD_GROUP_INDEX = 14,		// i32
	BX_SD_FLAGS = 15,			// u32
	BX_SD_CUSTOM_COLOR = 16,	// u32
	BX_SD_WORDS = 17,
};

enum bxShapeDefFlags
{
	BX_SD_IS_SENSOR = 0,
	BX_SD_ENABLE_SENSOR_EVENTS = 1,
	BX_SD_ENABLE_CONTACT_EVENTS = 2,
	BX_SD_ENABLE_HIT_EVENTS = 3,
	BX_SD_ENABLE_PRE_SOLVE_EVENTS = 4,
	BX_SD_INVOKE_CONTACT_CREATION = 5,
	BX_SD_UPDATE_BODY_MASS = 6,
	BX_SD_ENABLE_CUSTOM_FILTERING = 7,
	BX_SD_ENABLE_SPECULATIVE_CONTACT = 8,
};

// Every joint def starts with the base block; the per-type block follows at BX_JD_WORDS.
enum bxJointDefLayout
{
	BX_JD_LOCAL_FRAME_A = 0, // position 3, rotation 4
	BX_JD_LOCAL_FRAME_B = 7,
	BX_JD_FORCE_THRESHOLD = 14,
	BX_JD_TORQUE_THRESHOLD = 15,
	BX_JD_CONSTRAINT_HERTZ = 16,
	BX_JD_CONSTRAINT_DAMPING_RATIO = 17,
	BX_JD_DRAW_SCALE = 18,
	BX_JD_FLAGS = 19, // u32
	BX_JD_WORDS = 20,
};

enum bxJointDefFlags
{
	BX_JD_COLLIDE_CONNECTED = 0,
};

enum bxDistanceJointDefLayout
{
	BX_DJ_LENGTH = BX_JD_WORDS + 0,
	BX_DJ_LOWER_SPRING_FORCE = BX_JD_WORDS + 1,
	BX_DJ_UPPER_SPRING_FORCE = BX_JD_WORDS + 2,
	BX_DJ_HERTZ = BX_JD_WORDS + 3,
	BX_DJ_DAMPING_RATIO = BX_JD_WORDS + 4,
	BX_DJ_MIN_LENGTH = BX_JD_WORDS + 5,
	BX_DJ_MAX_LENGTH = BX_JD_WORDS + 6,
	BX_DJ_MAX_MOTOR_FORCE = BX_JD_WORDS + 7,
	BX_DJ_MOTOR_SPEED = BX_JD_WORDS + 8,
	BX_DJ_FLAGS = BX_JD_WORDS + 9, // bit0 spring, bit1 limit, bit2 motor
	BX_DJ_WORDS = BX_JD_WORDS + 10,
};

enum bxRevoluteJointDefLayout
{
	BX_RJ_TARGET_ANGLE = BX_JD_WORDS + 0,
	BX_RJ_HERTZ = BX_JD_WORDS + 1,
	BX_RJ_DAMPING_RATIO = BX_JD_WORDS + 2,
	BX_RJ_LOWER_ANGLE = BX_JD_WORDS + 3,
	BX_RJ_UPPER_ANGLE = BX_JD_WORDS + 4,
	BX_RJ_MAX_MOTOR_TORQUE = BX_JD_WORDS + 5,
	BX_RJ_MOTOR_SPEED = BX_JD_WORDS + 6,
	BX_RJ_FLAGS = BX_JD_WORDS + 7, // bit0 spring, bit1 limit, bit2 motor
	BX_RJ_WORDS = BX_JD_WORDS + 8,
};

enum bxSphericalJointDefLayout
{
	BX_SJ_HERTZ = BX_JD_WORDS + 0,
	BX_SJ_DAMPING_RATIO = BX_JD_WORDS + 1,
	BX_SJ_TARGET_ROTATION = BX_JD_WORDS + 2, // 4 floats
	BX_SJ_CONE_ANGLE = BX_JD_WORDS + 6,
	BX_SJ_LOWER_TWIST_ANGLE = BX_JD_WORDS + 7,
	BX_SJ_UPPER_TWIST_ANGLE = BX_JD_WORDS + 8,
	BX_SJ_MAX_MOTOR_TORQUE = BX_JD_WORDS + 9,
	BX_SJ_MOTOR_VELOCITY = BX_JD_WORDS + 10, // 3 floats
	BX_SJ_FLAGS = BX_JD_WORDS + 13,			 // bit0 spring, bit1 cone limit, bit2 twist limit, bit3 motor
	BX_SJ_WORDS = BX_JD_WORDS + 14,
};

enum bxPrismaticJointDefLayout
{
	BX_PJ_HERTZ = BX_JD_WORDS + 0,
	BX_PJ_DAMPING_RATIO = BX_JD_WORDS + 1,
	BX_PJ_TARGET_TRANSLATION = BX_JD_WORDS + 2,
	BX_PJ_LOWER_TRANSLATION = BX_JD_WORDS + 3,
	BX_PJ_UPPER_TRANSLATION = BX_JD_WORDS + 4,
	BX_PJ_MAX_MOTOR_FORCE = BX_JD_WORDS + 5,
	BX_PJ_MOTOR_SPEED = BX_JD_WORDS + 6,
	BX_PJ_FLAGS = BX_JD_WORDS + 7, // bit0 spring, bit1 limit, bit2 motor
	BX_PJ_WORDS = BX_JD_WORDS + 8,
};

enum bxWeldJointDefLayout
{
	BX_WJ_LINEAR_HERTZ = BX_JD_WORDS + 0,
	BX_WJ_ANGULAR_HERTZ = BX_JD_WORDS + 1,
	BX_WJ_LINEAR_DAMPING_RATIO = BX_JD_WORDS + 2,
	BX_WJ_ANGULAR_DAMPING_RATIO = BX_JD_WORDS + 3,
	BX_WJ_WORDS = BX_JD_WORDS + 4,
};

enum bxMotorJointDefLayout
{
	BX_MJ_LINEAR_VELOCITY = BX_JD_WORDS + 0, // 3 floats
	BX_MJ_MAX_VELOCITY_FORCE = BX_JD_WORDS + 3,
	BX_MJ_ANGULAR_VELOCITY = BX_JD_WORDS + 4, // 3 floats
	BX_MJ_MAX_VELOCITY_TORQUE = BX_JD_WORDS + 7,
	BX_MJ_LINEAR_HERTZ = BX_JD_WORDS + 8,
	BX_MJ_LINEAR_DAMPING_RATIO = BX_JD_WORDS + 9,
	BX_MJ_MAX_SPRING_FORCE = BX_JD_WORDS + 10,
	BX_MJ_ANGULAR_HERTZ = BX_JD_WORDS + 11,
	BX_MJ_ANGULAR_DAMPING_RATIO = BX_JD_WORDS + 12,
	BX_MJ_MAX_SPRING_TORQUE = BX_JD_WORDS + 13,
	BX_MJ_WORDS = BX_JD_WORDS + 14,
};

enum bxWheelJointDefLayout
{
	BX_WHJ_SUSPENSION_HERTZ = BX_JD_WORDS + 0,
	BX_WHJ_SUSPENSION_DAMPING_RATIO = BX_JD_WORDS + 1,
	BX_WHJ_LOWER_SUSPENSION_LIMIT = BX_JD_WORDS + 2,
	BX_WHJ_UPPER_SUSPENSION_LIMIT = BX_JD_WORDS + 3,
	BX_WHJ_MAX_SPIN_TORQUE = BX_JD_WORDS + 4,
	BX_WHJ_SPIN_SPEED = BX_JD_WORDS + 5,
	BX_WHJ_STEERING_HERTZ = BX_JD_WORDS + 6,
	BX_WHJ_STEERING_DAMPING_RATIO = BX_JD_WORDS + 7,
	BX_WHJ_TARGET_STEERING_ANGLE = BX_JD_WORDS + 8,
	BX_WHJ_MAX_STEERING_TORQUE = BX_JD_WORDS + 9,
	BX_WHJ_LOWER_STEERING_LIMIT = BX_JD_WORDS + 10,
	BX_WHJ_UPPER_STEERING_LIMIT = BX_JD_WORDS + 11,
	BX_WHJ_FLAGS =
		BX_JD_WORDS + 12, // bit0 suspension spring, bit1 suspension limit, bit2 spin motor, bit3 steering, bit4 steering limit
	BX_WHJ_WORDS = BX_JD_WORDS + 13,
};

enum bxParallelJointDefLayout
{
	BX_PLJ_HERTZ = BX_JD_WORDS + 0,
	BX_PLJ_DAMPING_RATIO = BX_JD_WORDS + 1,
	BX_PLJ_MAX_TORQUE = BX_JD_WORDS + 2,
	BX_PLJ_WORDS = BX_JD_WORDS + 3,
};

// ---------------------------------------------------------------------------
// Growable float buffers for per-step outputs
// ---------------------------------------------------------------------------

typedef struct bxFloatBuffer
{
	float* data;
	int count;
	int capacity;
} bxFloatBuffer;

float* bxFloatBuffer_Reserve( bxFloatBuffer* buffer, int floats );

// Record strides. Mirrored in src/runtime/layouts.ts.
enum bxStrides
{
	BX_STRIDE_MOVE = 9, // body, px, py, pz, qx, qy, qz, qw, fellAsleep
	BX_STRIDE_CONTACT_BEGIN =
		13, // shapeA, shapeB, bodyA, bodyB, px, py, pz, nx, ny, nz, totalNormalImpulse, pointCount, manifoldCount
	BX_STRIDE_CONTACT_END = 4,	// shapeA, shapeB, bodyA, bodyB (0 when already destroyed)
	BX_STRIDE_CONTACT_HIT = 11, // shapeA, shapeB, bodyA, bodyB, px, py, pz, nx, ny, nz, approachSpeed
	BX_STRIDE_SENSOR = 4,		// sensorShape, visitorShape, sensorBody, visitorBody
	BX_STRIDE_JOINT_EVENT = 1,	// joint
};

// ---------------------------------------------------------------------------
// Threads (deluxe build): the shim-owned task pool
// ---------------------------------------------------------------------------

void bxThreads_FillWorldDef( b3WorldDef* def, int workerCount );
void bxThreads_BeginStep( void );
