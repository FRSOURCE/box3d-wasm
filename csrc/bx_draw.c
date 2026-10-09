// Debug draw: b3World_Draw flattened into a line buffer and a point buffer the
// frontend reads in place. Shapes are not drawn here (the host renders its own
// geometry); this covers joints, bounds, contacts, islands, mass and so on.
#include "bx.h"

#include <math.h>
#include <stdlib.h>

#define BX_LINE_WORDS 7	 // x1 y1 z1 x2 y2 z2 color
#define BX_POINT_WORDS 5 // x y z size color
#define BX_CIRCLE_SEGMENTS 16

static bxWord* s_lines;
static int s_lineCount;
static int s_lineCapacity;
static bxWord* s_points;
static int s_pointCount;
static int s_pointCapacity;

static void bxLine( b3Vec3 a, b3Vec3 b, b3HexColor color )
{
	if ( s_lineCount >= s_lineCapacity )
	{
		s_lineCapacity = s_lineCapacity == 0 ? 1024 : s_lineCapacity * 2;
		s_lines = (bxWord*)realloc( s_lines, (size_t)s_lineCapacity * BX_LINE_WORDS * sizeof( bxWord ) );
	}
	bxWord* r = s_lines + (size_t)s_lineCount * BX_LINE_WORDS;
	r[0].f = a.x;
	r[1].f = a.y;
	r[2].f = a.z;
	r[3].f = b.x;
	r[4].f = b.y;
	r[5].f = b.z;
	r[6].u = (uint32_t)color;
	s_lineCount += 1;
}

static void bxPoint( b3Vec3 p, float size, b3HexColor color )
{
	if ( s_pointCount >= s_pointCapacity )
	{
		s_pointCapacity = s_pointCapacity == 0 ? 256 : s_pointCapacity * 2;
		s_points = (bxWord*)realloc( s_points, (size_t)s_pointCapacity * BX_POINT_WORDS * sizeof( bxWord ) );
	}
	bxWord* r = s_points + (size_t)s_pointCount * BX_POINT_WORDS;
	r[0].f = p.x;
	r[1].f = p.y;
	r[2].f = p.z;
	r[3].f = size;
	r[4].u = (uint32_t)color;
	s_pointCount += 1;
}

static void bxDrawSegment( b3Pos p1, b3Pos p2, b3HexColor color, void* context )
{
	(void)context;
	bxLine( p1, p2, color );
}

static void bxDrawPoint( b3Pos p, float size, b3HexColor color, void* context )
{
	(void)context;
	bxPoint( p, size, color );
}

static void bxCircle( b3Vec3 center, b3Vec3 u, b3Vec3 v, float radius, b3HexColor color )
{
	b3Vec3 prev = b3Add( center, b3MulSV( radius, u ) );
	for ( int i = 1; i <= BX_CIRCLE_SEGMENTS; ++i )
	{
		float angle = 2.0f * B3_PI * (float)i / (float)BX_CIRCLE_SEGMENTS;
		b3Vec3 next = b3Add( center, b3Add( b3MulSV( radius * cosf( angle ), u ), b3MulSV( radius * sinf( angle ), v ) ) );
		bxLine( prev, next, color );
		prev = next;
	}
}

static void bxDrawSphere( b3Pos p, float radius, b3HexColor color, float alpha, void* context )
{
	(void)alpha;
	(void)context;
	bxCircle( p, b3Vec3_axisX, b3Vec3_axisY, radius, color );
	bxCircle( p, b3Vec3_axisY, b3Vec3_axisZ, radius, color );
	bxCircle( p, b3Vec3_axisZ, b3Vec3_axisX, radius, color );
}

static void bxDrawCapsule( b3Pos p1, b3Pos p2, float radius, b3HexColor color, float alpha, void* context )
{
	bxDrawSphere( p1, radius, color, alpha, context );
	bxDrawSphere( p2, radius, color, alpha, context );
	bxLine( b3Add( p1, ( b3Vec3 ){ radius, 0, 0 } ), b3Add( p2, ( b3Vec3 ){ radius, 0, 0 } ), color );
	bxLine( b3Add( p1, ( b3Vec3 ){ -radius, 0, 0 } ), b3Add( p2, ( b3Vec3 ){ -radius, 0, 0 } ), color );
	bxLine( b3Add( p1, ( b3Vec3 ){ 0, 0, radius } ), b3Add( p2, ( b3Vec3 ){ 0, 0, radius } ), color );
	bxLine( b3Add( p1, ( b3Vec3 ){ 0, 0, -radius } ), b3Add( p2, ( b3Vec3 ){ 0, 0, -radius } ), color );
}

static void bxBoxEdges( b3Vec3 corners[8], b3HexColor color )
{
	// corner index bits: x = 1, y = 2, z = 4
	for ( int i = 0; i < 8; ++i )
	{
		for ( int bit = 1; bit <= 4; bit <<= 1 )
		{
			if ( ( i & bit ) == 0 )
			{
				bxLine( corners[i], corners[i | bit], color );
			}
		}
	}
}

static void bxDrawBounds( b3AABB aabb, b3HexColor color, void* context )
{
	(void)context;
	b3Vec3 c[8];
	for ( int i = 0; i < 8; ++i )
	{
		c[i] = ( b3Vec3 ){ ( i & 1 ) ? aabb.upperBound.x : aabb.lowerBound.x, ( i & 2 ) ? aabb.upperBound.y : aabb.lowerBound.y,
						   ( i & 4 ) ? aabb.upperBound.z : aabb.lowerBound.z };
	}
	bxBoxEdges( c, color );
}

static void bxDrawBox( b3Vec3 extents, b3WorldTransform transform, b3HexColor color, void* context )
{
	(void)context;
	b3Vec3 c[8];
	for ( int i = 0; i < 8; ++i )
	{
		b3Vec3 local = { ( i & 1 ) ? extents.x : -extents.x, ( i & 2 ) ? extents.y : -extents.y,
						 ( i & 4 ) ? extents.z : -extents.z };
		c[i] = b3Add( transform.p, b3RotateVector( transform.q, local ) );
	}
	bxBoxEdges( c, color );
}

static void bxDrawTransform( b3WorldTransform transform, void* context )
{
	(void)context;
	const float length = 0.5f;
	bxLine( transform.p, b3Add( transform.p, b3RotateVector( transform.q, ( b3Vec3 ){ length, 0, 0 } ) ), b3_colorRed );
	bxLine( transform.p, b3Add( transform.p, b3RotateVector( transform.q, ( b3Vec3 ){ 0, length, 0 } ) ), b3_colorGreen );
	bxLine( transform.p, b3Add( transform.p, b3RotateVector( transform.q, ( b3Vec3 ){ 0, 0, length } ) ), b3_colorBlue );
}

static void bxDrawShape( void* userShape, b3WorldTransform transform, b3HexColor color, void* context )
{
	(void)userShape;
	(void)transform;
	(void)color;
	(void)context;
}

static void bxDrawString( b3Pos p, const char* s, b3HexColor color, void* context )
{
	(void)p;
	(void)s;
	(void)color;
	(void)context;
}

enum bxDrawFlags
{
	BX_DRAW_JOINTS = 1 << 0,
	BX_DRAW_JOINT_EXTRAS = 1 << 1,
	BX_DRAW_BOUNDS = 1 << 2,
	BX_DRAW_MASS = 1 << 3,
	BX_DRAW_SLEEP = 1 << 4,
	BX_DRAW_BODY_NAMES = 1 << 5,
	BX_DRAW_CONTACTS = 1 << 6,
	BX_DRAW_ANCHOR_A = 1 << 7,
	BX_DRAW_GRAPH_COLORS = 1 << 8,
	BX_DRAW_CONTACT_FEATURES = 1 << 9,
	BX_DRAW_CONTACT_NORMALS = 1 << 10,
	BX_DRAW_CONTACT_FORCES = 1 << 11,
	BX_DRAW_ISLANDS = 1 << 12,
};

/// Fills the line and point buffers. flags is a bxDrawFlags mask. bounds culls what is drawn
/// (pass a huge box for everything). Returns the line count; see bx_Draw_PointCount.
BX_EXPORT int bx_World_Draw( int slot, int flags, float forceScale, float jointScale, float lx, float ly, float lz, float ux,
							 float uy, float uz )
{
	s_lineCount = 0;
	s_pointCount = 0;
	b3WorldId worldId = bxWorldId( slot );
	if ( B3_IS_NULL( worldId ) )
	{
		return 0;
	}
	b3DebugDraw draw = b3DefaultDebugDraw();
	draw.DrawShapeFcn = bxDrawShape;
	draw.DrawSegmentFcn = bxDrawSegment;
	draw.DrawTransformFcn = bxDrawTransform;
	draw.DrawPointFcn = bxDrawPoint;
	draw.DrawSphereFcn = bxDrawSphere;
	draw.DrawCapsuleFcn = bxDrawCapsule;
	draw.DrawBoundsFcn = bxDrawBounds;
	draw.DrawBoxFcn = bxDrawBox;
	draw.DrawStringFcn = bxDrawString;
	draw.drawingBounds = ( b3AABB ){ { lx, ly, lz }, { ux, uy, uz } };
	draw.forceScale = forceScale;
	draw.jointScale = jointScale;
	draw.drawShapes = false;
	draw.drawJoints = ( flags & BX_DRAW_JOINTS ) != 0;
	draw.drawJointExtras = ( flags & BX_DRAW_JOINT_EXTRAS ) != 0;
	draw.drawBounds = ( flags & BX_DRAW_BOUNDS ) != 0;
	draw.drawMass = ( flags & BX_DRAW_MASS ) != 0;
	draw.drawSleep = ( flags & BX_DRAW_SLEEP ) != 0;
	draw.drawBodyNames = ( flags & BX_DRAW_BODY_NAMES ) != 0;
	draw.drawContacts = ( flags & BX_DRAW_CONTACTS ) != 0;
	draw.drawAnchorA = ( flags & BX_DRAW_ANCHOR_A ) != 0;
	draw.drawGraphColors = ( flags & BX_DRAW_GRAPH_COLORS ) != 0;
	draw.drawContactFeatures = ( flags & BX_DRAW_CONTACT_FEATURES ) != 0;
	draw.drawContactNormals = ( flags & BX_DRAW_CONTACT_NORMALS ) != 0;
	draw.drawContactForces = ( flags & BX_DRAW_CONTACT_FORCES ) != 0;
	draw.drawIslands = ( flags & BX_DRAW_ISLANDS ) != 0;
	draw.context = NULL;
	b3World_Draw( worldId, &draw, UINT64_MAX );
	return s_lineCount;
}

BX_EXPORT bxWord* bx_Draw_Lines( void )
{
	return s_lines;
}

BX_EXPORT bxWord* bx_Draw_Points( void )
{
	return s_points;
}

BX_EXPORT int bx_Draw_PointCount( void )
{
	return s_pointCount;
}
