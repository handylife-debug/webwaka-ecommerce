import { NextRequest, NextResponse } from 'next/server';
import { cellBus } from '../../../../cell-sdk/loader/cell-bus';

// API route to handle Cell actions via RPC
// Route: /api/cells/[sector]/[name]/actions/[action]
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ cellPath: string[] }> }
) {
  try {
    const { cellPath } = await params;
    
    // Parse the cell path: [sector, name, 'actions', action]
    if (!cellPath || cellPath.length < 4 || cellPath[2] !== 'actions') {
      return NextResponse.json(
        { error: 'Invalid cell path. Expected: /api/cells/sector/name/actions/action' },
        { status: 400 }
      );
    }
    
    const [sector, name, _, action] = cellPath;
    const cellId = `${sector}/${name}`;
    
    // Get the payload from request body
    const payload = await request.json();
    
    // Get channel from headers
    const channel = request.headers.get('X-Cell-Channel') || 'stable';
    
    console.log(`[CellAPI] Executing ${cellId}:${action} on channel ${channel}`);
    
    // ✅ CELLULAR INDEPENDENCE: Use CellBus for all cells, including TaxAndFee
    // All cells now use unified Cell Gateway v2 communication
    const result = await cellBus.call(cellId, action, payload);
    return NextResponse.json(result);
    
  } catch (error) {
    console.error('[CellAPI] Error:', error);
    
    return NextResponse.json(
      { 
        error: 'Cell action failed',
        message: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}

// Handle GET requests for Cell metadata/health
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ cellPath: string[] }> }
) {
  try {
    const { cellPath } = await params;
    
    if (!cellPath || cellPath.length < 2) {
      return NextResponse.json(
        { error: 'Invalid cell path. Expected: /api/cells/sector/name' },
        { status: 400 }
      );
    }
    
    const [sector, name] = cellPath;
    const cellId = `${sector}/${name}`;
    
    // Check if this is a health check
    if (cellPath[2] === 'health') {
      const health = await cellBus.healthCheck(cellId);
      return NextResponse.json({ cellId, health });
    }
    
    // Return Cell metadata
    return NextResponse.json({
      cellId,
      sector,
      name,
      status: 'available',
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('[CellAPI] GET Error:', error);
    
    return NextResponse.json(
      { 
        error: 'Failed to get cell information',
        message: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}