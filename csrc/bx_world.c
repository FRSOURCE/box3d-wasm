// Worlds: creation from the def buffer, stepping, settings, explosions, stats.
#include "bx.h"

#define BX_WORLD( slot )                                                                                                         \
	b3WorldId worldId = bxWorldId( slot );                                                                                       \
	if ( B3_IS_NULL( worldId ) )                                                                                                 \
	{                                                                                                                            \
		return;                                                                                                                  \
	}

#define BX_WORLD_RET( slot, value )                                                                                              \
	b3WorldId worldId = bxWorldId( slot );                                                                                       \
	if ( B3_IS_NULL( worldId ) )                                                                                                 \
	{                                                                                                                            \
		return value;                                                                                                            \
	}

/// Writes b3DefaultWorldDef into the def buffer.
BX_EXPORT void bx_WorldDef_Default( void )
{
	b3WorldDef def = b3DefaultWorldDef();
	bxDefSetVec3( BX_WD_GRAVITY, def.gravity );
	bx_def[BX_WD_RESTITUTION_THRESHOLD].f = def.restitutionThreshold;
	bx_def[BX_WD_HIT_EVENT_THRESHOLD].f = def.hitEventThreshold;
	bx_def[BX_WD_CONTACT_HERTZ].f = def.contactHertz;
	bx_def[BX_WD_CONTACT_DAMPING_RATIO].f = def.contactDampingRatio;
	bx_def[BX_WD_CONTACT_SPEED].f = def.contactSpeed;
	bx_def[BX_WD_MAXIMUM_LINEAR_SPEED].f = def.maximumLinearSpeed;
	bx_def[BX_WD_RESTITUTION_ITERATIONS].i = def.restitutionIterations;
	bx_def[BX_WD_WORKER_COUNT].u = 1;
	bx_def[BX_WD_FLAGS].u = 0;
	bxDefSetFlag( BX_WD_FLAGS, BX_WD_ENABLE_SLEEP, def.enableSleep );
	bxDefSetFlag( BX_WD_FLAGS, BX_WD_ENABLE_CONTINUOUS, def.enableContinuous );
	bxDefSetFlag( BX_WD_FLAGS, BX_WD_ENABLE_RESTITUTION_PROPAGATION, def.enableRestitutionPropagation );
	bx_def[BX_WD_CAPACITY].i = def.capacity.staticShapeCount;
	bx_def[BX_WD_CAPACITY + 1].i = def.capacity.dynamicShapeCount;
	bx_def[BX_WD_CAPACITY + 2].i = def.capacity.staticBodyCount;
	bx_def[BX_WD_CAPACITY + 3].i = def.capacity.dynamicBodyCount;
	bx_def[BX_WD_CAPACITY + 4].i = def.capacity.contactCount;
}

/// Creates a world from the def buffer. Returns the world slot, 0 on failure.
BX_EXPORT int bx_CreateWorld( void )
{
	b3WorldDef def = b3DefaultWorldDef();
	def.gravity = bxDefVec3( BX_WD_GRAVITY );
	def.restitutionThreshold = bx_def[BX_WD_RESTITUTION_THRESHOLD].f;
	def.hitEventThreshold = bx_def[BX_WD_HIT_EVENT_THRESHOLD].f;
	def.contactHertz = bx_def[BX_WD_CONTACT_HERTZ].f;
	def.contactDampingRatio = bx_def[BX_WD_CONTACT_DAMPING_RATIO].f;
	def.contactSpeed = bx_def[BX_WD_CONTACT_SPEED].f;
	def.maximumLinearSpeed = bx_def[BX_WD_MAXIMUM_LINEAR_SPEED].f;
	def.restitutionIterations = bx_def[BX_WD_RESTITUTION_ITERATIONS].i;
	def.enableSleep = bxDefFlag( BX_WD_FLAGS, BX_WD_ENABLE_SLEEP );
	def.enableContinuous = bxDefFlag( BX_WD_FLAGS, BX_WD_ENABLE_CONTINUOUS );
	def.enableRestitutionPropagation = bxDefFlag( BX_WD_FLAGS, BX_WD_ENABLE_RESTITUTION_PROPAGATION );
	def.capacity.staticShapeCount = bx_def[BX_WD_CAPACITY].i;
	def.capacity.dynamicShapeCount = bx_def[BX_WD_CAPACITY + 1].i;
	def.capacity.staticBodyCount = bx_def[BX_WD_CAPACITY + 2].i;
	def.capacity.dynamicBodyCount = bx_def[BX_WD_CAPACITY + 3].i;
	def.capacity.contactCount = bx_def[BX_WD_CAPACITY + 4].i;
	bxThreads_FillWorldDef( &def, (int)bx_def[BX_WD_WORKER_COUNT].u );

	int slot = bxTable_Alloc( &bx_worlds );
	def.userData = (void*)(intptr_t)slot;
	b3WorldId id = b3CreateWorld( &def );
	if ( B3_IS_NULL( id ) )
	{
		bxTable_Free( &bx_worlds, slot );
		return 0;
	}
	bxWorld* world = bxTable_Get( &bx_worlds, slot );
	world->id = id;
	world->alive = 1;
	return slot;
}

/// Destroys the world and releases every body, shape and joint slot in it.
BX_EXPORT void bx_DestroyWorld( int slot )
{
	bxWorld* world = bxTable_Get( &bx_worlds, slot );
	if ( world == NULL || world->alive == 0 )
	{
		return;
	}
	b3DestroyWorld( world->id );
	for ( int i = 1; i < bx_shapes.count; ++i )
	{
		bxShape* shape = bxTable_Get( &bx_shapes, i );
		bxBody* body = shape->alive ? bxTable_Get( &bx_bodies, shape->body ) : NULL;
		if ( body != NULL && body->world == slot )
		{
			bxTable_Free( &bx_shapes, i );
		}
	}
	for ( int i = 1; i < bx_joints.count; ++i )
	{
		bxJoint* joint = bxTable_Get( &bx_joints, i );
		if ( joint->alive && joint->world == slot )
		{
			bxTable_Free( &bx_joints, i );
		}
	}
	for ( int i = 1; i < bx_bodies.count; ++i )
	{
		bxBody* body = bxTable_Get( &bx_bodies, i );
		if ( body->alive && body->world == slot )
		{
			bxTable_Free( &bx_bodies, i );
		}
	}
	bxTable_Free( &bx_worlds, slot );
}

BX_EXPORT int bx_World_IsValid( int slot )
{
	b3WorldId worldId = bxWorldId( slot );
	return B3_IS_NON_NULL( worldId ) && b3World_IsValid( worldId );
}

BX_EXPORT void bx_World_Step( int slot, float timeStep, int subStepCount )
{
	BX_WORLD( slot );
	bxThreads_BeginStep();
	b3World_Step( worldId, timeStep, subStepCount );
}

/// scratch: [gx, gy, gz]
BX_EXPORT void bx_World_GetGravity( int slot )
{
	BX_WORLD( slot );
	bxScratchVec3( 0, b3World_GetGravity( worldId ) );
}

BX_EXPORT void bx_World_SetGravity( int slot, float x, float y, float z )
{
	BX_WORLD( slot );
	b3Vec3 g = { x, y, z };
	b3World_SetGravity( worldId, g );
}

BX_EXPORT void bx_World_EnableSleeping( int slot, int flag )
{
	BX_WORLD( slot );
	b3World_EnableSleeping( worldId, flag != 0 );
}

BX_EXPORT int bx_World_IsSleepingEnabled( int slot )
{
	BX_WORLD_RET( slot, 0 );
	return b3World_IsSleepingEnabled( worldId );
}

BX_EXPORT void bx_World_EnableContinuous( int slot, int flag )
{
	BX_WORLD( slot );
	b3World_EnableContinuous( worldId, flag != 0 );
}

BX_EXPORT int bx_World_IsContinuousEnabled( int slot )
{
	BX_WORLD_RET( slot, 0 );
	return b3World_IsContinuousEnabled( worldId );
}

BX_EXPORT void bx_World_SetMaximumLinearSpeed( int slot, float speed )
{
	BX_WORLD( slot );
	b3World_SetMaximumLinearSpeed( worldId, speed );
}

BX_EXPORT float bx_World_GetMaximumLinearSpeed( int slot )
{
	BX_WORLD_RET( slot, 0.0f );
	return b3World_GetMaximumLinearSpeed( worldId );
}

BX_EXPORT void bx_World_SetContactTuning( int slot, float hertz, float dampingRatio, float contactSpeed )
{
	BX_WORLD( slot );
	b3World_SetContactTuning( worldId, hertz, dampingRatio, contactSpeed );
}

BX_EXPORT void bx_World_SetRestitutionThreshold( int slot, float value )
{
	BX_WORLD( slot );
	b3World_SetRestitutionThreshold( worldId, value );
}

BX_EXPORT float bx_World_GetRestitutionThreshold( int slot )
{
	BX_WORLD_RET( slot, 0.0f );
	return b3World_GetRestitutionThreshold( worldId );
}

BX_EXPORT void bx_World_SetHitEventThreshold( int slot, float value )
{
	BX_WORLD( slot );
	b3World_SetHitEventThreshold( worldId, value );
}

BX_EXPORT float bx_World_GetHitEventThreshold( int slot )
{
	BX_WORLD_RET( slot, 0.0f );
	return b3World_GetHitEventThreshold( worldId );
}

BX_EXPORT int bx_World_GetAwakeBodyCount( int slot )
{
	BX_WORLD_RET( slot, 0 );
	return b3World_GetAwakeBodyCount( worldId );
}

BX_EXPORT int bx_World_GetWorkerCount( int slot )
{
	BX_WORLD_RET( slot, 0 );
	return b3World_GetWorkerCount( worldId );
}

BX_EXPORT void bx_World_Explode( int slot, float px, float py, float pz, float radius, float falloff, float impulsePerArea,
								 uint32_t maskLo, uint32_t maskHi )
{
	BX_WORLD( slot );
	b3ExplosionDef def = b3DefaultExplosionDef();
	b3Vec3 p = { px, py, pz };
	def.position = p;
	def.radius = radius;
	def.falloff = falloff;
	def.impulsePerArea = impulsePerArea;
	def.maskBits = (uint64_t)maskLo | ( (uint64_t)maskHi << 32 );
	b3World_Explode( worldId, &def );
}

/// scratch: the 23 b3Profile fields in declaration order, milliseconds
BX_EXPORT int bx_World_GetProfile( int slot )
{
	BX_WORLD_RET( slot, 0 );
	b3Profile p = b3World_GetProfile( worldId );
	const float* fields = &p.step;
	int count = (int)( sizeof( b3Profile ) / sizeof( float ) );
	for ( int i = 0; i < count; ++i )
	{
		bx_scratch[i].f = fields[i];
	}
	return count;
}

/// scratch (i32): [bodyCount, shapeCount, contactCount, jointCount, islandCount, stackUsed, arenaCapacity,
/// staticTreeHeight, treeHeight, taskCount, awakeContactCount, recycledContactCount, byteCountLo, byteCountHi]
BX_EXPORT int bx_World_GetCounters( int slot )
{
	BX_WORLD_RET( slot, 0 );
	b3Counters c = b3World_GetCounters( worldId );
	bx_scratch[0].i = c.bodyCount;
	bx_scratch[1].i = c.shapeCount;
	bx_scratch[2].i = c.contactCount;
	bx_scratch[3].i = c.jointCount;
	bx_scratch[4].i = c.islandCount;
	bx_scratch[5].i = c.stackUsed;
	bx_scratch[6].i = c.arenaCapacity;
	bx_scratch[7].i = c.staticTreeHeight;
	bx_scratch[8].i = c.treeHeight;
	bx_scratch[9].i = c.taskCount;
	bx_scratch[10].i = c.awakeContactCount;
	bx_scratch[11].i = c.recycledContactCount;
	bx_scratch[12].u = (uint32_t)( (uint64_t)c.byteCount & 0xffffffffu );
	bx_scratch[13].u = (uint32_t)( (uint64_t)c.byteCount >> 32 );
	return 14;
}
