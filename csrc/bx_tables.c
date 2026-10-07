// Slot tables, scratch and def buffers, and the module-level exports.
#include "bx.h"

#include <stdlib.h>
#include <string.h>

bxTable bx_worlds = { NULL, sizeof( bxWorld ), 0, 0, NULL, 0 };
bxTable bx_bodies = { NULL, sizeof( bxBody ), 0, 0, NULL, 0 };
bxTable bx_shapes = { NULL, sizeof( bxShape ), 0, 0, NULL, 0 };
bxTable bx_joints = { NULL, sizeof( bxJoint ), 0, 0, NULL, 0 };

bxWord bx_scratch[BX_SCRATCH_WORDS];
bxWord bx_def[BX_DEF_WORDS];

// ---------------------------------------------------------------------------
// Tables
// ---------------------------------------------------------------------------

int bxTable_Alloc( bxTable* table )
{
	if ( table->freeCount > 0 )
	{
		table->freeCount -= 1;
		int slot = table->freeList[table->freeCount];
		memset( (char*)table->items + (size_t)slot * (size_t)table->itemSize, 0, (size_t)table->itemSize );
		return slot;
	}
	if ( table->count == 0 )
	{
		// slot 0 is the null slot
		table->count = 1;
	}
	if ( table->count >= table->capacity )
	{
		int capacity = table->capacity == 0 ? 64 : table->capacity * 2;
		table->items = realloc( table->items, (size_t)capacity * (size_t)table->itemSize );
		table->freeList = (int*)realloc( table->freeList, (size_t)capacity * sizeof( int ) );
		table->capacity = capacity;
	}
	int slot = table->count;
	table->count += 1;
	memset( (char*)table->items + (size_t)slot * (size_t)table->itemSize, 0, (size_t)table->itemSize );
	return slot;
}

void bxTable_Free( bxTable* table, int slot )
{
	if ( slot <= 0 || slot >= table->count )
	{
		return;
	}
	memset( (char*)table->items + (size_t)slot * (size_t)table->itemSize, 0, (size_t)table->itemSize );
	table->freeList[table->freeCount++] = slot;
}

void* bxTable_Get( bxTable* table, int slot )
{
	if ( slot <= 0 || slot >= table->count )
	{
		return NULL;
	}
	return (char*)table->items + (size_t)slot * (size_t)table->itemSize;
}

b3WorldId bxWorldId( int slot )
{
	bxWorld* world = bxTable_Get( &bx_worlds, slot );
	if ( world == NULL || world->alive == 0 )
	{
		return b3_nullWorldId;
	}
#ifdef BX_CHECK_HANDLES
	B3_ASSERT( b3World_IsValid( world->id ) );
#endif
	return world->id;
}

b3BodyId bxBodyId( int slot )
{
	bxBody* body = bxTable_Get( &bx_bodies, slot );
	if ( body == NULL || body->alive == 0 )
	{
		return b3_nullBodyId;
	}
#ifdef BX_CHECK_HANDLES
	B3_ASSERT( b3Body_IsValid( body->id ) );
#endif
	return body->id;
}

b3ShapeId bxShapeId( int slot )
{
	bxShape* shape = bxTable_Get( &bx_shapes, slot );
	if ( shape == NULL || shape->alive == 0 )
	{
		return b3_nullShapeId;
	}
#ifdef BX_CHECK_HANDLES
	B3_ASSERT( b3Shape_IsValid( shape->id ) );
#endif
	return shape->id;
}

bxJoint* bxJointAt( int slot )
{
	bxJoint* joint = bxTable_Get( &bx_joints, slot );
	if ( joint == NULL || joint->alive == 0 )
	{
		return NULL;
	}
	return joint;
}

b3JointId bxJointId( int slot )
{
	bxJoint* joint = bxJointAt( slot );
	if ( joint == NULL )
	{
		return b3_nullJointId;
	}
#ifdef BX_CHECK_HANDLES
	B3_ASSERT( b3Joint_IsValid( joint->id ) );
#endif
	return joint->id;
}

int bxBodySlotOf( b3BodyId id )
{
	if ( b3Body_IsValid( id ) == false )
	{
		return 0;
	}
	return (int)(intptr_t)b3Body_GetUserData( id );
}

int bxShapeSlotOf( b3ShapeId id )
{
	if ( b3Shape_IsValid( id ) == false )
	{
		return 0;
	}
	return (int)(intptr_t)b3Shape_GetUserData( id );
}

int bxBodySlotOfShape( b3ShapeId id )
{
	if ( b3Shape_IsValid( id ) == false )
	{
		return 0;
	}
	return bxBodySlotOf( b3Shape_GetBody( id ) );
}

int bxJointSlotOf( b3JointId id )
{
	if ( b3Joint_IsValid( id ) == false )
	{
		return 0;
	}
	return (int)(intptr_t)b3Joint_GetUserData( id );
}

// ---------------------------------------------------------------------------
// Scratch and def helpers
// ---------------------------------------------------------------------------

void bxScratchVec3( int at, b3Vec3 v )
{
	bx_scratch[at].f = v.x;
	bx_scratch[at + 1].f = v.y;
	bx_scratch[at + 2].f = v.z;
}

void bxScratchQuat( int at, b3Quat q )
{
	bx_scratch[at].f = q.v.x;
	bx_scratch[at + 1].f = q.v.y;
	bx_scratch[at + 2].f = q.v.z;
	bx_scratch[at + 3].f = q.s;
}

void bxScratchTransform( int at, b3Transform xf )
{
	bxScratchVec3( at, xf.p );
	bxScratchQuat( at + 3, xf.q );
}

void bxScratchMat3( int at, b3Matrix3 m )
{
	bxScratchVec3( at, m.cx );
	bxScratchVec3( at + 3, m.cy );
	bxScratchVec3( at + 6, m.cz );
}

b3Vec3 bxDefVec3( int at )
{
	b3Vec3 v = { bx_def[at].f, bx_def[at + 1].f, bx_def[at + 2].f };
	return v;
}

b3Quat bxDefQuat( int at )
{
	b3Quat q = { { bx_def[at].f, bx_def[at + 1].f, bx_def[at + 2].f }, bx_def[at + 3].f };
	return b3NormalizeQuat( q );
}

b3Transform bxDefTransform( int at )
{
	b3Transform xf = { bxDefVec3( at ), bxDefQuat( at + 3 ) };
	return xf;
}

void bxDefSetVec3( int at, b3Vec3 v )
{
	bx_def[at].f = v.x;
	bx_def[at + 1].f = v.y;
	bx_def[at + 2].f = v.z;
}

void bxDefSetQuat( int at, b3Quat q )
{
	bx_def[at].f = q.v.x;
	bx_def[at + 1].f = q.v.y;
	bx_def[at + 2].f = q.v.z;
	bx_def[at + 3].f = q.s;
}

void bxDefSetTransform( int at, b3Transform xf )
{
	bxDefSetVec3( at, xf.p );
	bxDefSetQuat( at + 3, xf.q );
}

uint64_t bxDefU64( int lo )
{
	return (uint64_t)bx_def[lo].u | ( (uint64_t)bx_def[lo + 1].u << 32 );
}

void bxDefSetU64( int lo, uint64_t v )
{
	bx_def[lo].u = (uint32_t)( v & 0xffffffffu );
	bx_def[lo + 1].u = (uint32_t)( v >> 32 );
}

int bxDefFlag( int at, int bit )
{
	return ( bx_def[at].u >> bit ) & 1u;
}

void bxDefSetFlag( int at, int bit, int on )
{
	if ( on )
	{
		bx_def[at].u |= 1u << bit;
	}
	else
	{
		bx_def[at].u &= ~( 1u << bit );
	}
}

float* bxFloatBuffer_Reserve( bxFloatBuffer* buffer, int floats )
{
	if ( floats > buffer->capacity )
	{
		int capacity = buffer->capacity == 0 ? 256 : buffer->capacity;
		while ( capacity < floats )
		{
			capacity *= 2;
		}
		buffer->data = (float*)realloc( buffer->data, (size_t)capacity * sizeof( float ) );
		buffer->capacity = capacity;
	}
	return buffer->data;
}

// ---------------------------------------------------------------------------
// Module exports
// ---------------------------------------------------------------------------

BX_EXPORT float* bx_Scratch( void )
{
	return &bx_scratch[0].f;
}

BX_EXPORT float* bx_DefBuffer( void )
{
	return &bx_def[0].f;
}

BX_EXPORT void* bx_Alloc( int bytes )
{
	return malloc( (size_t)( bytes > 0 ? bytes : 1 ) );
}

BX_EXPORT void bx_Free( void* p )
{
	free( p );
}

/// major * 10000 + minor * 100 + revision
BX_EXPORT int bx_GetVersion( void )
{
	b3Version v = b3GetVersion();
	return v.major * 10000 + v.minor * 100 + v.revision;
}

#ifndef BX_ENGINE_SHA
#define BX_ENGINE_SHA "unknown"
#endif

BX_EXPORT const char* bx_GetEngineSha( void )
{
	return BX_ENGINE_SHA;
}

BX_EXPORT int bx_GetMaxWorlds( void )
{
	return B3_MAX_WORLDS;
}

BX_EXPORT int bx_Layout_WorldDefWords( void )
{
	return BX_WD_WORDS;
}

BX_EXPORT int bx_Layout_BodyDefWords( void )
{
	return BX_BD_WORDS;
}

BX_EXPORT int bx_Layout_ShapeDefWords( void )
{
	return BX_SD_WORDS;
}

BX_EXPORT int bx_Layout_JointDefWords( void )
{
	return BX_JD_WORDS;
}

BX_EXPORT int bx_Layout_DistanceJointDefWords( void )
{
	return BX_DJ_WORDS;
}

BX_EXPORT int bx_Layout_RevoluteJointDefWords( void )
{
	return BX_RJ_WORDS;
}

BX_EXPORT int bx_Layout_SphericalJointDefWords( void )
{
	return BX_SJ_WORDS;
}

BX_EXPORT int bx_Layout_PrismaticJointDefWords( void )
{
	return BX_PJ_WORDS;
}

BX_EXPORT int bx_Layout_WeldJointDefWords( void )
{
	return BX_WJ_WORDS;
}

BX_EXPORT int bx_Layout_MotorJointDefWords( void )
{
	return BX_MJ_WORDS;
}

BX_EXPORT int bx_Layout_WheelJointDefWords( void )
{
	return BX_WHJ_WORDS;
}

BX_EXPORT int bx_Layout_ParallelJointDefWords( void )
{
	return BX_PLJ_WORDS;
}

BX_EXPORT int bx_Stride_Move( void )
{
	return BX_STRIDE_MOVE;
}

BX_EXPORT int bx_Stride_ContactBegin( void )
{
	return BX_STRIDE_CONTACT_BEGIN;
}

BX_EXPORT int bx_Stride_ContactEnd( void )
{
	return BX_STRIDE_CONTACT_END;
}

BX_EXPORT int bx_Stride_ContactHit( void )
{
	return BX_STRIDE_CONTACT_HIT;
}

BX_EXPORT int bx_Stride_Sensor( void )
{
	return BX_STRIDE_SENSOR;
}

BX_EXPORT int bx_Stride_JointEvent( void )
{
	return BX_STRIDE_JOINT_EVENT;
}
