// Character mover: capsule casts and collision planes, plus the plane solver.
#include "bx.h"

#include <float.h>
#include <stdlib.h>

#define BX_PLANE_WORDS 10 // shape, nx, ny, nz, offset, px, py, pz, triangle, child

static bxWord* s_planes;
static int s_planeCount;
static int s_planeCapacity;

static b3QueryFilter bxMoverFilter( uint32_t categoryLo, uint32_t categoryHi, uint32_t maskLo, uint32_t maskHi )
{
	b3QueryFilter filter = b3DefaultQueryFilter();
	filter.categoryBits = (uint64_t)categoryLo | ( (uint64_t)categoryHi << 32 );
	filter.maskBits = (uint64_t)maskLo | ( (uint64_t)maskHi << 32 );
	return filter;
}

static b3Capsule bxMoverCapsule( const float* c )
{
	b3Capsule capsule = { { c[0], c[1], c[2] }, { c[3], c[4], c[5] }, c[6] };
	return capsule;
}

static void bxAppendPlane( int shapeSlot, const b3PlaneResult* plane )
{
	if ( s_planeCount >= s_planeCapacity )
	{
		s_planeCapacity = s_planeCapacity == 0 ? 32 : s_planeCapacity * 2;
		s_planes = (bxWord*)realloc( s_planes, (size_t)s_planeCapacity * BX_PLANE_WORDS * sizeof( bxWord ) );
	}
	bxWord* r = s_planes + (size_t)s_planeCount * BX_PLANE_WORDS;
	s_planeCount += 1;
	r[0].i = shapeSlot;
	r[1].f = plane->plane.normal.x;
	r[2].f = plane->plane.normal.y;
	r[3].f = plane->plane.normal.z;
	r[4].f = plane->plane.offset;
	r[5].f = plane->point.x;
	r[6].f = plane->point.y;
	r[7].f = plane->point.z;
	r[8].i = plane->triangleIndex;
	r[9].i = plane->childIndex;
}

static bool bxPlaneCallback( b3ShapeId shapeId, const b3PlaneResult* planes, int planeCount, void* context )
{
	(void)context;
	int slot = bxShapeSlotOf( shapeId );
	for ( int i = 0; i < planeCount; ++i )
	{
		bxAppendPlane( slot, planes + i );
	}
	return true;
}

BX_EXPORT bxWord* bx_Mover_Planes( void )
{
	return s_planes;
}

BX_EXPORT int bx_Mover_PlaneWords( void )
{
	return BX_PLANE_WORDS;
}

/// mover: 7 floats in wasm memory [ax, ay, az, bx, by, bz, radius], relative to origin.
/// Returns the translation fraction the mover can travel (0..1).
BX_EXPORT float bx_World_CastMover( int slot, float ox, float oy, float oz, const float* mover, float dx, float dy, float dz,
									uint32_t categoryLo, uint32_t categoryHi, uint32_t maskLo, uint32_t maskHi )
{
	b3WorldId worldId = bxWorldId( slot );
	if ( B3_IS_NULL( worldId ) || mover == NULL )
	{
		return 1.0f;
	}
	b3Capsule capsule = bxMoverCapsule( mover );
	b3Vec3 origin = { ox, oy, oz };
	b3Vec3 translation = { dx, dy, dz };
	return b3World_CastMover( worldId, origin, &capsule, translation, bxMoverFilter( categoryLo, categoryHi, maskLo, maskHi ),
							  NULL, NULL );
}

/// Gathers collision planes into the plane buffer. Returns the plane count.
BX_EXPORT int bx_World_CollideMover( int slot, float ox, float oy, float oz, const float* mover, uint32_t categoryLo,
									 uint32_t categoryHi, uint32_t maskLo, uint32_t maskHi )
{
	s_planeCount = 0;
	b3WorldId worldId = bxWorldId( slot );
	if ( B3_IS_NULL( worldId ) || mover == NULL )
	{
		return 0;
	}
	b3Capsule capsule = bxMoverCapsule( mover );
	b3Vec3 origin = { ox, oy, oz };
	b3World_CollideMover( worldId, origin, &capsule, bxMoverFilter( categoryLo, categoryHi, maskLo, maskHi ), bxPlaneCallback,
						  NULL );
	return s_planeCount;
}

/// Collides the mover with one body at its current transform. Returns the plane count.
BX_EXPORT int bx_Body_CollideMover( int slot, float ox, float oy, float oz, const float* mover, uint32_t categoryLo,
									uint32_t categoryHi, uint32_t maskLo, uint32_t maskHi )
{
	s_planeCount = 0;
	b3BodyId bodyId = bxBodyId( slot );
	if ( B3_IS_NULL( bodyId ) || mover == NULL )
	{
		return 0;
	}
	int capacity = b3Body_GetShapeCount( bodyId );
	if ( capacity <= 0 )
	{
		return 0;
	}
	// a shape can produce several planes (meshes), so leave room
	capacity *= 8;
	b3BodyPlaneResult* results = (b3BodyPlaneResult*)malloc( (size_t)capacity * sizeof( b3BodyPlaneResult ) );
	b3Capsule capsule = bxMoverCapsule( mover );
	b3Vec3 origin = { ox, oy, oz };
	int count = b3Body_CollideMover( bodyId, results, capacity, origin, &capsule,
									 bxMoverFilter( categoryLo, categoryHi, maskLo, maskHi ), b3Body_GetTransform( bodyId ) );
	for ( int i = 0; i < count; ++i )
	{
		bxAppendPlane( bxShapeSlotOf( results[i].shapeId ), &results[i].result );
	}
	free( results );
	return s_planeCount;
}

/// Sweeps the mover against one body held at its current transform.
/// Returns the hit shape slot, or 0 for a miss; scratch: [px, py, pz, nx, ny, nz, fraction]
BX_EXPORT int bx_Body_TimeOfImpactMover( int slot, float ox, float oy, float oz, const float* mover, float dx, float dy, float dz,
										 uint32_t categoryLo, uint32_t categoryHi, uint32_t maskLo, uint32_t maskHi )
{
	b3BodyId bodyId = bxBodyId( slot );
	if ( B3_IS_NULL( bodyId ) || mover == NULL )
	{
		return 0;
	}
	b3Capsule capsule = bxMoverCapsule( mover );
	b3Vec3 origin = { ox, oy, oz };
	b3Vec3 translation = { dx, dy, dz };
	b3WorldTransform xf = b3Body_GetTransform( bodyId );
	b3BodyTOIResult result = b3Body_TimeOfImpactMover( bodyId, origin, &capsule, translation,
													   bxMoverFilter( categoryLo, categoryHi, maskLo, maskHi ), xf, xf );
	int shape = bxShapeSlotOf( result.shapeId );
	if ( shape == 0 )
	{
		return 0;
	}
	bxScratchVec3( 0, result.point );
	bxScratchVec3( 3, result.normal );
	bx_scratch[6].f = result.fraction;
	return shape;
}

/// planes: count records of 7 floats [nx, ny, nz, offset, pushLimit, push, clipVelocity (0 or 1)]; push is written back.
/// scratch: [dx, dy, dz, iterationCount (i32)]
BX_EXPORT void bx_SolvePlanes( float dx, float dy, float dz, float* planes, int count )
{
	b3CollisionPlane* list = (b3CollisionPlane*)malloc( (size_t)( count > 0 ? count : 1 ) * sizeof( b3CollisionPlane ) );
	for ( int i = 0; i < count; ++i )
	{
		const float* p = planes + 7 * i;
		list[i].plane.normal = ( b3Vec3 ){ p[0], p[1], p[2] };
		list[i].plane.offset = p[3];
		list[i].pushLimit = p[4];
		list[i].push = p[5];
		list[i].clipVelocity = p[6] != 0.0f;
	}
	b3Vec3 target = { dx, dy, dz };
	b3PlaneSolverResult result = b3SolvePlanes( target, list, count );
	for ( int i = 0; i < count; ++i )
	{
		planes[7 * i + 5] = list[i].push;
	}
	free( list );
	bxScratchVec3( 0, result.delta );
	bx_scratch[3].i = result.iterationCount;
}

/// Same plane records as bx_SolvePlanes. scratch: [x, y, z]
BX_EXPORT void bx_ClipVector( float vx, float vy, float vz, const float* planes, int count )
{
	b3CollisionPlane* list = (b3CollisionPlane*)malloc( (size_t)( count > 0 ? count : 1 ) * sizeof( b3CollisionPlane ) );
	for ( int i = 0; i < count; ++i )
	{
		const float* p = planes + 7 * i;
		list[i].plane.normal = ( b3Vec3 ){ p[0], p[1], p[2] };
		list[i].plane.offset = p[3];
		list[i].pushLimit = p[4];
		list[i].push = p[5];
		list[i].clipVelocity = p[6] != 0.0f;
	}
	b3Vec3 vector = { vx, vy, vz };
	bxScratchVec3( 0, b3ClipVector( vector, list, count ) );
	free( list );
}
