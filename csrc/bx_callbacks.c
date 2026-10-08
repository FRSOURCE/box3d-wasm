// Optional JS callbacks: friction and restitution mixing, pre-solve and custom
// contact filtering. They are called from inside the step, so a world with
// callbacks steps its tasks on the calling thread (see bxThreads_SetInline) and
// runs with one worker.
#include "bx.h"

#include <emscripten.h>
#include <math.h>

enum bxCallbackBits
{
	BX_CB_FRICTION = 1,
	BX_CB_RESTITUTION = 2,
	BX_CB_PRE_SOLVE = 4,
	BX_CB_CUSTOM_FILTER = 8,
};

static int s_currentWorld;

void bxCallbacks_SetCurrentWorld( int slot )
{
	s_currentWorld = slot;
}

// clang-format off
// (the formatter does not understand the JavaScript bodies)
// The callbacks live on the module object so the same trampolines serve every world:
// Module.bxCallbacks[worldSlot] = { friction, restitution, preSolve, customFilter }.
EM_JS( float, bx_js_mix, ( int world, int which, float a, int aLo, int aHi, float b, int bLo, int bHi ), {
	const cb = Module['bxCallbacks'] && Module['bxCallbacks'][world];
	const fn = cb && ( which === 0 ? cb.friction : cb.restitution );
	return fn ? fn( a, aLo >>> 0, aHi >>> 0, b, bLo >>> 0, bHi >>> 0 ) : NaN;
} );

EM_JS( int, bx_js_filter, ( int world, int shapeA, int shapeB ), {
	const cb = Module['bxCallbacks'] && Module['bxCallbacks'][world];
	return cb && cb.customFilter ? ( cb.customFilter( shapeA, shapeB ) ? 1 : 0 ) : 1;
} );

EM_JS( int, bx_js_presolve, ( int world, int shapeA, int shapeB, float px, float py, float pz, float nx, float ny, float nz ), {
	const cb = Module['bxCallbacks'] && Module['bxCallbacks'][world];
	return cb && cb.preSolve ? ( cb.preSolve( shapeA, shapeB, px, py, pz, nx, ny, nz ) ? 1 : 0 ) : 1;
} );

// clang-format on

static float bxMix( int which, float a, uint64_t idA, float b, uint64_t idB, float fallback )
{
	float v = bx_js_mix( s_currentWorld, which, a, (int)( idA & 0xffffffffu ), (int)( idA >> 32 ), b, (int)( idB & 0xffffffffu ),
						 (int)( idB >> 32 ) );
	return v != v ? fallback : v; // NaN means the JS callback declined
}

static float bxFriction( float frictionA, uint64_t userMaterialIdA, float frictionB, uint64_t userMaterialIdB )
{
	return bxMix( 0, frictionA, userMaterialIdA, frictionB, userMaterialIdB, sqrtf( frictionA * frictionB ) );
}

static float bxRestitution( float restitutionA, uint64_t userMaterialIdA, float restitutionB, uint64_t userMaterialIdB )
{
	float larger = restitutionA > restitutionB ? restitutionA : restitutionB;
	return bxMix( 1, restitutionA, userMaterialIdA, restitutionB, userMaterialIdB, larger );
}

static bool bxCustomFilter( b3ShapeId shapeIdA, b3ShapeId shapeIdB, void* context )
{
	return bx_js_filter( (int)(intptr_t)context, bxShapeSlotOf( shapeIdA ), bxShapeSlotOf( shapeIdB ) ) != 0;
}

static bool bxPreSolve( b3ShapeId shapeIdA, b3ShapeId shapeIdB, b3Pos point, b3Vec3 normal, void* context )
{
	return bx_js_presolve( (int)(intptr_t)context, bxShapeSlotOf( shapeIdA ), bxShapeSlotOf( shapeIdB ), point.x, point.y,
						   point.z, normal.x, normal.y, normal.z ) != 0;
}

/// Registers the engine callbacks named in the bitmask (1 friction, 2 restitution, 4 pre-solve, 8 custom filter) and
/// unregisters the rest. The JS functions go in Module.bxCallbacks[slot]. With any callback on, the world runs one worker.
BX_EXPORT void bx_World_SetCallbacks( int slot, int mask )
{
	bxWorld* world = bxTable_Get( &bx_worlds, slot );
	if ( world == NULL || world->alive == 0 )
	{
		return;
	}
	b3WorldId worldId = world->id;
	b3World_SetFrictionCallback( worldId, ( mask & BX_CB_FRICTION ) ? bxFriction : NULL );
	b3World_SetRestitutionCallback( worldId, ( mask & BX_CB_RESTITUTION ) ? bxRestitution : NULL );
	b3World_SetPreSolveCallback( worldId, ( mask & BX_CB_PRE_SOLVE ) ? bxPreSolve : NULL, (void*)(intptr_t)slot );
	b3World_SetCustomFilterCallback( worldId, ( mask & BX_CB_CUSTOM_FILTER ) ? bxCustomFilter : NULL, (void*)(intptr_t)slot );
	if ( mask != 0 && world->callbackMask == 0 )
	{
		world->savedWorkers = b3World_GetWorkerCount( worldId );
		b3World_SetWorkerCount( worldId, 1 );
	}
	else if ( mask == 0 && world->callbackMask != 0 )
	{
		b3World_SetWorkerCount( worldId, world->savedWorkers > 0 ? world->savedWorkers : 1 );
	}
	world->callbackMask = mask;
}
