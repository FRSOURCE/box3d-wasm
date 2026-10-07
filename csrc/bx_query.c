// World queries. The closest ray cast writes its hit to scratch.
#include "bx.h"

static b3QueryFilter bxQueryFilter( uint32_t categoryLo, uint32_t categoryHi, uint32_t maskLo, uint32_t maskHi )
{
	b3QueryFilter filter = b3DefaultQueryFilter();
	filter.categoryBits = (uint64_t)categoryLo | ( (uint64_t)categoryHi << 32 );
	filter.maskBits = (uint64_t)maskLo | ( (uint64_t)maskHi << 32 );
	return filter;
}

/// Returns the shape slot hit, 0 for a miss.
/// scratch: [px, py, pz, nx, ny, nz, fraction, body (i32), triangleIndex (i32), childIndex (i32), materialLo (u32),
/// materialHi (u32)]
BX_EXPORT int bx_World_CastRayClosest( int slot, float ox, float oy, float oz, float dx, float dy, float dz, uint32_t categoryLo,
									   uint32_t categoryHi, uint32_t maskLo, uint32_t maskHi )
{
	b3WorldId worldId = bxWorldId( slot );
	if ( B3_IS_NULL( worldId ) )
	{
		return 0;
	}
	b3Vec3 origin = { ox, oy, oz };
	b3Vec3 translation = { dx, dy, dz };
	b3RayResult result =
		b3World_CastRayClosest( worldId, origin, translation, bxQueryFilter( categoryLo, categoryHi, maskLo, maskHi ) );
	if ( result.hit == false )
	{
		return 0;
	}
	int shape = bxShapeSlotOf( result.shapeId );
	if ( shape == 0 )
	{
		return 0;
	}
	bxScratchVec3( 0, result.point );
	bxScratchVec3( 3, result.normal );
	bx_scratch[6].f = result.fraction;
	bx_scratch[7].i = bxBodySlotOfShape( result.shapeId );
	bx_scratch[8].i = result.triangleIndex;
	bx_scratch[9].i = result.childIndex;
	bx_scratch[10].u = (uint32_t)( result.userMaterialId & 0xffffffffu );
	bx_scratch[11].u = (uint32_t)( result.userMaterialId >> 32 );
	return shape;
}
