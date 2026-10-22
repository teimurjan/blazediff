# Object Diffing Benchmarks

Deep-diff comparisons for plain JS objects and arrays.

## Object (`@blazediff/object` vs `microdiff`)

_10000 iterations (50 warmup)_

> **~6.7%** performance improvement on average.

<table>
  <thead>
    <tr>
      <th width="500">Benchmark</th>
      <th width="500">Microdiff</th>
      <th width="500">BlazeDiff</th>
      <th width="500">Time Saved</th>
      <th width="500">% Improvement</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td>complex object - tag addition</td>
      <td>0.0019ms</td>
      <td>0.0015ms</td>
      <td>0.0005ms</td>
      <td>23.7%</td>
    </tr>
    <tr>
      <td>deep nested - timeout change</td>
      <td>0.0009ms</td>
      <td>0.0009ms</td>
      <td>-0.0001ms</td>
      <td>-7.1%</td>
    </tr>
    <tr>
      <td>large array - single item change</td>
      <td>0.2728ms</td>
      <td>0.2359ms</td>
      <td>0.0369ms</td>
      <td>13.5%</td>
    </tr>
    <tr>
      <td>large identical arrays</td>
      <td>0.0561ms</td>
      <td>0.0036ms</td>
      <td>0.0525ms</td>
      <td>93.6%</td>
    </tr>
    <tr>
      <td>large nested object - multiple small changes</td>
      <td>1.5876ms</td>
      <td>1.5005ms</td>
      <td>0.0871ms</td>
      <td>5.5%</td>
    </tr>
    <tr>
      <td>nested object - theme change</td>
      <td>0.0014ms</td>
      <td>0.0012ms</td>
      <td>0.0002ms</td>
      <td>13.8%</td>
    </tr>
    <tr>
      <td>simple object - age change</td>
      <td>0.0001ms</td>
      <td>0.0002ms</td>
      <td>-0.0001ms</td>
      <td>-71.9%</td>
    </tr>
    <tr>
      <td>simple object - identical</td>
      <td>0.0001ms</td>
      <td>0.0002ms</td>
      <td>-0.0000ms</td>
      <td>-17.8%</td>
    </tr>
  </tbody>
</table>

_Benchmarks run on MacBook Pro M1 Max, Node.js 22_
